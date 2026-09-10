/**
 * The zones this device knows about, learned rather than fetched.
 *
 * <h2>Why this exists at all</h2>
 *
 * A plate lookup needs a `zoneId` and a bay code together — that pair is what makes a verdict
 * conclusive (CONTRACT.md v0.7: "la bahía es el discriminador"). But the enforcement portal
 * publishes no zone catalogue: `/api/v1/admin/parking/zones` and `/api/v1/citizen/parking/zones`
 * both exist and both are refused to an inspector token, because a portal's token never authorises
 * another portal's routes (CONTRACT.md §3), and there is no `/api/v1/inspector/**` equivalent.
 *
 * Since v0.28 the catalogue comes from `GET /api/v1/inspector/zones`, and this file is no longer a
 * workaround for a missing endpoint: it is the **offline cache**. The app writes the catalogue into
 * it on every successful fetch and keeps learning from the responses it reads anyway — its own
 * citations and every plate lookup — so a phone that loses signal opens its lookup screen with the
 * zones it saw last time instead of with nothing.
 *
 * (Historical note, because the gap was real: the endpoint existed on the server from v0.7 and no
 * screen called it, so a brand-new device knew no zone until its first citation — and an officer
 * with an empty picker can only ever get `AMBIGUOUS`.)
 *
 * Keyed per municipality, because a zone id means nothing outside the one it belongs to.
 */

export interface KnownZone {
  id: string;
  code: string;
  name: string;
  /** Bay codes seen in this zone, newest first. Offered as suggestions, never as a closed list. */
  recentBays: string[];
}

const STORAGE_PREFIX = 'luparx.inspector.zones';
const MAX_RECENT_BAYS = 12;

function storageKey(tenantId: string): string {
  return `${STORAGE_PREFIX}.${tenantId}`;
}

const cache = new Map<string, KnownZone[]>();
const listeners = new Set<() => void>();
const EMPTY: KnownZone[] = [];

function read(tenantId: string): KnownZone[] {
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId));
    const parsed = raw ? (JSON.parse(raw) as KnownZone[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function snapshot(tenantId: string): KnownZone[] {
  let zones = cache.get(tenantId);
  if (!zones) {
    zones = read(tenantId);
    cache.set(tenantId, zones);
  }
  return zones;
}

export function subscribeToZones(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function knownZones(tenantId: string | null): KnownZone[] {
  return tenantId ? snapshot(tenantId) : EMPTY;
}

export interface ZoneSighting {
  zoneId?: string | null;
  zoneCode?: string | null;
  zoneName?: string | null;
  spaceCode?: string | null;
}

/**
 * Records what the server just told us about a zone.
 *
 * Deliberately a no-op when nothing changed: this runs on every list and lookup response, and
 * writing an identical array would re-render every screen subscribed to it for no reason.
 */
/**
 * The municipality's own zone catalogue, written into the cache (CONTRACT.md v0.28).
 *
 * Distinct from {@link rememberZones}, which learns from sightings: this one is authoritative, so a
 * zone's code and name are taken from it rather than merged, while the bay codes an officer has
 * actually typed are kept — those are the suggestions that make the field quick, and the server's
 * range is a summary, not a list.
 */
export function rememberCatalogZones(
  tenantId: string | null,
  zones: readonly { id: string; code: string; name: string }[],
): void {
  if (!tenantId || zones.length === 0) return;
  const current = snapshot(tenantId);
  const byId = new Map(current.map((zone) => [zone.id, zone]));
  for (const zone of zones) {
    byId.set(zone.id, { id: zone.id, code: zone.code, name: zone.name, recentBays: byId.get(zone.id)?.recentBays ?? [] });
  }
  persist(tenantId, [...byId.values()]);
}

export function rememberZones(tenantId: string | null, sightings: readonly ZoneSighting[]): void {
  if (!tenantId || sightings.length === 0) return;
  const current = snapshot(tenantId);
  const byId = new Map(current.map((zone) => [zone.id, zone]));
  let changed = false;

  for (const sighting of sightings) {
    if (!sighting.zoneId) continue;
    const existing = byId.get(sighting.zoneId);
    const code = sighting.zoneCode ?? existing?.code ?? '';
    const name = sighting.zoneName ?? existing?.name ?? code;
    const bay = sighting.spaceCode?.trim();
    const recentBays = existing ? [...existing.recentBays] : [];
    if (bay && !recentBays.includes(bay)) {
      recentBays.unshift(bay);
      recentBays.splice(MAX_RECENT_BAYS);
      changed = true;
    }
    if (!existing || existing.code !== code || existing.name !== name) changed = true;
    byId.set(sighting.zoneId, { id: sighting.zoneId, code, name, recentBays });
  }

  if (!changed) return;
  persist(tenantId, [...byId.values()]);
}

function persist(tenantId: string, zones: KnownZone[]): void {
  const next = [...zones].sort((a, b) => a.name.localeCompare(b.name));
  cache.set(tenantId, next);
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify(next));
  } catch {
    // The directory is a convenience; a browser refusing storage costs suggestions, not correctness.
  }
  listeners.forEach((listener) => listener());
}
