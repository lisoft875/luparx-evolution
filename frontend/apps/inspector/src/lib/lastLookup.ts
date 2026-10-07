/**
 * La última consulta de placa de este aparato.
 *
 * <h2>Por qué existe, y por qué NO es un dato inventado</h2>
 *
 * <p>La especificación visual del fiscalizador pide, debajo de la consulta rápida, un bloque
 * «Última consulta» con la placa, el estado, la zona y la vigencia — «únicamente si existe; si no,
 * estado vacío». Y pide, en la misma página, no inventar datos: «contadores, vehículo, permisos,
 * infracciones y actividad deben venir del backend».</p>
 *
 * <p>No hay endpoint de historial de consultas: el servidor registra cada una en la bitácora de
 * fiscalización (`checkId`, CONTRACT.md v0.29) pero no publica ninguna ruta para leerla de vuelta.
 * Buscarla sería inventar un endpoint; mostrar un vehículo de ejemplo sería inventar un dato.</p>
 *
 * <p>Lo que sí es real y ya está en el aparato es la respuesta que el servidor acaba de dar. Esto
 * guarda ESA — no una copia adornada, sólo los campos que el bloque dibuja — y la vuelve a mostrar
 * al abrir la pantalla. Es el mismo criterio con el que `zoneDirectory` guarda las zonas: el
 * teléfono recuerda lo que el servidor ya le dijo. Si el aparato nunca consultó nada, no hay nada
 * que mostrar y la pantalla dice eso.</p>
 *
 * <p>Una sola, no un historial: el documento pide «última consulta», y guardar una lista de placas
 * consultadas en el almacenamiento del teléfono es un registro de movimientos de personas que nadie
 * pidió y que no tendría quien lo borre.</p>
 *
 * <p>Por municipalidad, como todo lo demás de este portal: una zona y una bahía no significan nada
 * fuera de la suya.</p>
 */
import type { PlateStatus, PlateVerdict } from '@luparx/api-client';

export interface LastLookup {
  plate: string;
  verdict: PlateVerdict;
  /** Nombre de la zona de la bahía consultada, cuando la respuesta la nombró. */
  zoneName: string | null;
  spaceCode: string | null;
  /** Fin de la estadía que sostiene el veredicto, en ISO. `null` cuando no hay ninguna. */
  expiresAt: string | null;
  /** Hasta cuándo vale la exención, cuando el veredicto es `EXEMPT`. */
  exemptUntil: string | null;
  checkedAt: string;
}

const STORAGE_PREFIX = 'luparx.inspector.lastLookup';
const listeners = new Set<() => void>();
const cache = new Map<string, LastLookup | null>();

function storageKey(tenantId: string): string {
  return `${STORAGE_PREFIX}.${tenantId}`;
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

function read(tenantId: string): LastLookup | null {
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastLookup;
    return parsed && typeof parsed.plate === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function subscribeToLastLookup(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Lo último consultado en esta municipalidad, o `null` si este aparato no consultó nada todavía. */
export function lastLookup(tenantId: string | null): LastLookup | null {
  if (!tenantId) return null;
  if (!cache.has(tenantId)) cache.set(tenantId, read(tenantId));
  return cache.get(tenantId) ?? null;
}

/** Guarda la respuesta que el servidor acaba de dar. Sólo los campos que el bloque dibuja. */
export function rememberLookup(tenantId: string | null, status: PlateStatus): void {
  if (!tenantId) return;
  const stay = status.coveringStay ?? status.expiredStay ?? null;
  const fila: LastLookup = {
    plate: status.plateNormalized,
    verdict: status.verdict,
    zoneName: stay?.zoneName ?? status.bay?.zoneName ?? null,
    spaceCode: stay?.spaceCode ?? status.bay?.spaceCode ?? null,
    expiresAt: stay?.expiresAt ?? null,
    exemptUntil: status.exemption?.validTo ?? null,
    checkedAt: status.checkedAt,
  };
  cache.set(tenantId, fila);
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify(fila));
  } catch {
    /* Modo privado o almacenamiento lleno: la pantalla funciona igual, sólo no recuerda. */
  }
  notify();
}
