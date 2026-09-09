import type { ApiClient, CitationStatus, CreateCitationRequest } from '@luparx/api-client';
import { ApiError, NetworkError } from '@luparx/api-client';
import { deletePhotos, getPhoto, putPhoto } from './photoStore';

/**
 * The queue that makes this app usable in a street with no signal.
 *
 * <h2>Why the identifiers are minted here and only here</h2>
 *
 * A citation captured out of coverage is written down locally and sent later, possibly much later,
 * possibly after the app was closed and reopened, possibly twice because the officer pressed retry
 * while the first attempt was still in flight. Two identifiers keep that from producing two tickets
 * for one infraction, and both are generated **once, when the capture is created**, and persisted
 * with it:
 *
 * - `deviceCitationId` protects the *act*. It is unique per municipality on the server, so a resend
 *   — even from a reinstalled app with brand-new keys — answers `200` with the citation that
 *   already exists instead of `201` with a second one.
 * - `idempotencyKey` protects the *request*. The server replays the stored response for a repeated
 *   key, which is what makes "retry" safe when the first attempt's response was simply lost.
 *
 * Generating either one at send time would defeat both: that is the single easiest way to corrupt
 * this data, and it is why neither is ever derived, defaulted or regenerated below.
 *
 * <h2>What is stored where</h2>
 *
 * Metadata in `localStorage`, read synchronously so the pending count is right on the first frame;
 * photograph bytes in IndexedDB (see ./photoStore), because they do not fit in `localStorage`.
 *
 * <h2>Ordering</h2>
 *
 * Records are sent oldest first and one at a time. A shift produces a handful of citations, and a
 * parallel flush over a bad connection buys nothing while making the failure story much harder to
 * read.
 */

/** A photograph waiting to be uploaded. `key` is its handle in IndexedDB, never its bytes. */
export interface QueuedPhoto {
  key: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  capturedAt: string;
  latitude?: number;
  longitude?: number;
  /**
   * True when the client scaled the image down to fit the deployment's upload limit. Recorded, and
   * shown, because evidence that was altered must say so — never silently.
   */
  scaledDown: boolean;
  originalByteSize: number;
  uploaded: boolean;
}

export type QueuedCitationState = 'PENDING' | 'SENDING' | 'FAILED' | 'SENT';

export interface QueuedCitation {
  /** Local row id. Not the server's, and not the device citation id either. */
  id: string;
  tenantId: string;
  /** Minted once, at capture. The server's guard against a second ticket for the same act. */
  deviceCitationId: string;
  /** Minted once, at capture. Reused verbatim on every attempt at `POST /citations`. */
  idempotencyKey: string;
  /** Minted once, at capture. Reused verbatim on every attempt at `POST /citations/{id}/issue`. */
  issueIdempotencyKey: string;
  createdAt: string;
  payload: CreateCitationRequest;
  photos: QueuedPhoto[];
  /** Copied from the infraction type at capture, so the rule survives a catalogue change mid-shift. */
  requiresPhoto: boolean;
  infractionName: string;
  state: QueuedCitationState;
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  nextAttemptAt: number;
  /** Set the moment the server acknowledges the act. From then on, `POST /citations` is never repeated. */
  citationId: string | null;
  number: string | null;
  status: CitationStatus | null;
  sentAt: string | null;
}

const STORAGE_PREFIX = 'luparx.inspector.citationQueue';
/** Sent rows linger this long so the officer sees what happened, then stop being clutter. */
const SENT_RETENTION_MS = 15 * 60 * 1000;
/** Deployment default (`luparx.enforcement.maxEvidenceBytes`); the server is the authority. */
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_CITATION = 6;

function storageKey(tenantId: string): string {
  return `${STORAGE_PREFIX}.${tenantId}`;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---- Persistence -------------------------------------------------------------------------------

function read(tenantId: string): QueuedCitation[] {
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedCitation[];
    if (!Array.isArray(parsed)) return [];
    // A row left mid-flight by a closed tab is pending again, not stuck forever in SENDING.
    return parsed.map((row) => (row.state === 'SENDING' ? { ...row, state: 'PENDING' as const } : row));
  } catch {
    return [];
  }
}

function write(tenantId: string, rows: QueuedCitation[]): void {
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify(rows));
  } catch {
    // Storage refused (private window, quota). The in-memory copy still drives this session, and
    // the officer is told about pending work by the same badge either way.
  }
}

// ---- Observable store --------------------------------------------------------------------------

const cache = new Map<string, QueuedCitation[]>();
const listeners = new Set<() => void>();

function snapshot(tenantId: string): QueuedCitation[] {
  let rows = cache.get(tenantId);
  if (!rows) {
    rows = prune(read(tenantId));
    cache.set(tenantId, rows);
  }
  return rows;
}

function prune(rows: QueuedCitation[]): QueuedCitation[] {
  const cutoff = Date.now() - SENT_RETENTION_MS;
  return rows.filter((row) => row.state !== 'SENT' || (row.sentAt ? Date.parse(row.sentAt) > cutoff : true));
}

function commit(tenantId: string, rows: QueuedCitation[]): void {
  cache.set(tenantId, rows);
  write(tenantId, rows);
  listeners.forEach((listener) => listener());
}

function update(tenantId: string, id: string, patch: Partial<QueuedCitation>): void {
  commit(
    tenantId,
    snapshot(tenantId).map((row) => (row.id === id ? { ...row, ...patch } : row)),
  );
}

export function subscribeToQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable reference between commits — `useSyncExternalStore` re-renders on identity change. */
export function queueSnapshot(tenantId: string | null): QueuedCitation[] {
  if (!tenantId) return EMPTY;
  return snapshot(tenantId);
}

const EMPTY: QueuedCitation[] = [];

// ---- Enqueue -----------------------------------------------------------------------------------

export interface EnqueueInput {
  tenantId: string;
  payload: Omit<CreateCitationRequest, 'deviceCitationId'>;
  photos: { blob: Blob; fileName: string; capturedAt: string; latitude?: number; longitude?: number; scaledDown: boolean; originalByteSize: number }[];
  requiresPhoto: boolean;
  infractionName: string;
}

/**
 * Writes the capture down. This is the only place a `deviceCitationId` is ever created.
 *
 * The photographs' bytes go to IndexedDB before the row is committed, so a row can never claim
 * evidence that is not there.
 */
export async function enqueueCitation(input: EnqueueInput): Promise<QueuedCitation> {
  const deviceCitationId = newId();
  const photos: QueuedPhoto[] = [];
  for (const photo of input.photos) {
    const key = `${deviceCitationId}:${newId()}`;
    await putPhoto(key, photo.blob);
    photos.push({
      key,
      fileName: photo.fileName,
      contentType: photo.blob.type || 'image/jpeg',
      byteSize: photo.blob.size,
      capturedAt: photo.capturedAt,
      latitude: photo.latitude,
      longitude: photo.longitude,
      scaledDown: photo.scaledDown,
      originalByteSize: photo.originalByteSize,
      uploaded: false,
    });
  }
  const row: QueuedCitation = {
    id: newId(),
    tenantId: input.tenantId,
    deviceCitationId,
    idempotencyKey: newId(),
    issueIdempotencyKey: newId(),
    createdAt: new Date().toISOString(),
    payload: { ...input.payload, deviceCitationId },
    photos,
    requiresPhoto: input.requiresPhoto,
    infractionName: input.infractionName,
    state: 'PENDING',
    attempts: 0,
    lastErrorCode: null,
    lastErrorMessage: null,
    nextAttemptAt: 0,
    citationId: null,
    number: null,
    status: null,
    sentAt: null,
  };
  commit(input.tenantId, [...snapshot(input.tenantId), row]);
  return row;
}

/** Throws the capture away. Used only from an explicit confirmation — nothing discards silently. */
export async function discardQueued(tenantId: string, id: string): Promise<void> {
  const row = snapshot(tenantId).find((candidate) => candidate.id === id);
  if (row) await deletePhotos(row.photos.map((photo) => photo.key));
  commit(
    tenantId,
    snapshot(tenantId).filter((candidate) => candidate.id !== id),
  );
}

// ---- Flush -------------------------------------------------------------------------------------

/**
 * Exponential backoff with jitter, capped at a minute.
 *
 * Capped low on purpose: the officer is standing in the street and coverage comes back in seconds,
 * not hours. The jitter keeps a fleet of devices coming out of the same dead spot from arriving in
 * lockstep.
 */
function backoffMs(attempts: number): number {
  const base = Math.min(60_000, 2_000 * 2 ** Math.min(attempts, 5));
  return base * (0.75 + Math.random() * 0.5);
}

function describe(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  if (error instanceof NetworkError) return { code: 'NETWORK_ERROR', message: error.message };
  return { code: 'UNKNOWN_ERROR', message: error instanceof Error ? error.message : String(error) };
}

/**
 * Errors the server has settled: retrying cannot change the answer, so the row stops burning
 * attempts and waits for a person. Everything else — a lost connection, a 5xx, a timeout — is
 * retried, because the act was captured and must not be dropped on the floor.
 */
const TERMINAL_CODES = new Set([
  'VALIDATION_FAILED',
  'INFRACTION_TYPE_NOT_FOUND',
  'INFRACTION_TYPE_INACTIVE',
  'PARKING_SPACE_NOT_FOUND',
  'EVIDENCE_TYPE_NOT_ALLOWED',
  'EVIDENCE_TOO_LARGE',
  'ACCESS_DENIED',
  'IDEMPOTENCY_KEY_CONFLICT',
]);

let flushing = false;

/**
 * Sends everything that is due, oldest first.
 *
 * Re-entrancy is guarded rather than queued: a second call while one is running is a no-op, so the
 * `online` event, the periodic sweep and the officer's own "retry" cannot triple-send.
 */
export async function flushQueue(apiClient: ApiClient, tenantId: string | null): Promise<void> {
  if (!tenantId || flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing = true;
  try {
    const now = Date.now();
    const due = snapshot(tenantId).filter(
      (row) => (row.state === 'PENDING' || row.state === 'FAILED') && row.nextAttemptAt <= now,
    );
    for (const row of due) {
      await send(apiClient, tenantId, row.id);
    }
  } finally {
    flushing = false;
  }
}

/** One row, all the way: create the act, upload what is missing, close the draft. */
async function send(apiClient: ApiClient, tenantId: string, id: string): Promise<void> {
  const current = snapshot(tenantId).find((row) => row.id === id);
  if (!current || current.state === 'SENT') return;
  update(tenantId, id, { state: 'SENDING', lastErrorCode: null, lastErrorMessage: null });

  try {
    let citationId = current.citationId;
    let status = current.status;
    let number = current.number;

    if (!citationId) {
      // The one call that could create a duplicate, carrying both guards against it.
      const result = await apiClient.inspectorEnforcement.create(current.payload, current.idempotencyKey);
      citationId = result.citation.id;
      status = result.citation.status;
      number = result.citation.number;
      update(tenantId, id, { citationId, status, number });
    }

    // Photographs, one at a time, marking each as it lands so a failure halfway never re-uploads
    // what already arrived — the server would accept the duplicate and the citation would carry
    // the same photograph twice.
    const photos = snapshot(tenantId).find((row) => row.id === id)?.photos ?? [];
    for (const photo of photos) {
      if (photo.uploaded) continue;
      const blob = await getPhoto(photo.key);
      if (!blob) {
        // The bytes are gone (storage cleared). Say so rather than issuing a citation that claims
        // evidence it does not have.
        throw new Error('EVIDENCE_BYTES_MISSING');
      }
      await apiClient.inspectorEnforcement.attachPhoto(citationId, blob, {
        fileName: photo.fileName,
        capturedAt: photo.capturedAt,
        latitude: photo.latitude,
        longitude: photo.longitude,
      });
      const rows = snapshot(tenantId);
      update(tenantId, id, {
        photos: (rows.find((row) => row.id === id)?.photos ?? []).map((candidate) =>
          candidate.key === photo.key ? { ...candidate, uploaded: true } : candidate,
        ),
      });
    }

    if (status === 'DRAFT') {
      const issued = await apiClient.inspectorEnforcement.issue(citationId, current.issueIdempotencyKey);
      status = issued.citation.status;
      number = issued.citation.number;
    }

    await deletePhotos(photos.map((photo) => photo.key));
    update(tenantId, id, {
      state: 'SENT',
      status,
      number,
      sentAt: new Date().toISOString(),
      attempts: current.attempts + 1,
    });
  } catch (error) {
    const described = describe(error);
    const attempts = current.attempts + 1;
    const terminal = TERMINAL_CODES.has(described.code);
    update(tenantId, id, {
      state: 'FAILED',
      attempts,
      lastErrorCode: described.code,
      lastErrorMessage: described.message,
      // A settled refusal waits for a person instead of retrying into the same wall.
      nextAttemptAt: terminal ? Number.MAX_SAFE_INTEGER : Date.now() + backoffMs(attempts),
    });
  }
}

/** Clears the backoff on every failed row so an explicit "retry" is immediate. */
export function retryAllNow(tenantId: string | null): void {
  if (!tenantId) return;
  commit(
    tenantId,
    snapshot(tenantId).map((row) =>
      row.state === 'FAILED' ? { ...row, state: 'PENDING' as const, nextAttemptAt: 0 } : row,
    ),
  );
}

/** How many captures are still owed to the server. What the app bar shows. */
export function pendingCount(rows: readonly QueuedCitation[]): number {
  return rows.filter((row) => row.state !== 'SENT').length;
}
