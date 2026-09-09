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
 * So the app learns the zones from the responses it *is* entitled to read — its own citations, and
 * every plate lookup — and keeps them on the device, where they also survive going offline. This is
 * a workaround for a missing endpoint and is written down as one:
 *
 * TODO(contract): replace this with `GET /api/v1/inspector/zones` (PERM_CITATION_ISSUE) the moment
 * the backend publishes it. Until then an officer on a brand-new device knows no zone until their
 * first lookup or their first citation, which is a real gap and not a design choice.
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
  const next = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  cache.set(tenantId, next);
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify(next));
  } catch {
    // The directory is a convenience; a browser refusing storage costs suggestions, not correctness.
  }
  listeners.forEach((listener) => listener());
}
