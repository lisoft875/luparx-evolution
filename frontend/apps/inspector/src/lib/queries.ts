import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { locationPermissionGranted, takePosition } from './capture';
import type {
  AppNotification,
  CitationDetail,
  InfractionType,
  PagedResponse,
  PlateStatus,
  Citation,
} from '@luparx/api-client';
import {
  flushQueue,
  pendingCount,
  queueSnapshot,
  retryAllNow,
  subscribeToQueue,
  type QueuedCitation,
} from './citationQueue';
import {
  knownZones,
  rememberCatalogZones,
  rememberZones,
  subscribeToZones,
  type KnownZone,
} from './zoneDirectory';
import { lastLookup, rememberLookup, subscribeToLastLookup, type LastLookup } from './lastLookup';

/**
 * TanStack Query hooks over the inspector's v0.7 surface (CONTRACT.md §"API del fiscalizador").
 * Screens talk to these and never to `apiClient.inspectorEnforcement` directly, so cache keys,
 * invalidation and the "what did the server just teach us about zones" side effect all live in one
 * file.
 */
const KEYS = {
  infractionTypes: ['inspector', 'infraction-types'] as const,
  citations: (page: number, size: number) => ['inspector', 'citations', page, size] as const,
  citation: (id: string) => ['inspector', 'citation', id] as const,
  notifications: (page: number, size: number) => ['inspector', 'notifications', page, size] as const,
  unreadCount: ['inspector', 'notifications', 'unread-count'] as const,
};

/**
 * The catalogue an officer writes under. Cached for the length of a shift rather than re-fetched
 * per screen: the server itself allows five minutes of private caching, and a device in and out of
 * coverage should not lose its picker every time a request fails.
 */
export function useInfractionTypes(): UseQueryResult<InfractionType[]> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: KEYS.infractionTypes,
    queryFn: () => apiClient.inspectorEnforcement.infractionTypes(),
    staleTime: 5 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
  });
}

export function useMyCitations(page: number, size: number): UseQueryResult<PagedResponse<Citation>> {
  const { apiClient, activeTenant } = useAuth();
  const tenantId = activeTenant?.id ?? null;
  const query = useQuery({
    queryKey: KEYS.citations(page, size),
    queryFn: () => apiClient.inspectorEnforcement.list({ page, size }),
  });
  // Every citation names the zone it was written in, and the enforcement portal publishes no zone
  // catalogue of its own (see ./zoneDirectory). This is one of the two places the app learns them.
  useEffect(() => {
    rememberZones(tenantId, query.data?.items ?? []);
  }, [tenantId, query.data]);
  return query;
}

export function useCitation(id: string | undefined): UseQueryResult<CitationDetail> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: KEYS.citation(id ?? ''),
    queryFn: () => apiClient.inspectorEnforcement.get(id as string),
    enabled: Boolean(id),
  });
}

export interface PlateLookupInput {
  plate: string;
  zoneId?: string;
  spaceCode?: string;
}

/**
 * The plate lookup, as a mutation rather than a query.
 *
 * It is an action the officer takes, once, standing in front of a car, and its answer must never be
 * served from a cache: someone who pays while the officer walks up has to be covered by the time
 * the officer looks. The server says so too (`Cache-Control: no-store`); modelling it as a query
 * with a key would invite exactly the staleness both sides are trying to avoid.
 *
 * Since v0.29 it is also a **recorded** act: the server writes it to the fiscalisation log, which is
 * why the request now carries where the officer was — but only when they had already granted
 * location on this device. The lookup never asks for the permission itself; that still happens on the
 * citation form, with its sheet of explanation. An officer typing plates is not consenting to be
 * followed around a shift.
 */
export function usePlateLookup() {
  const { apiClient, activeTenant } = useAuth();
  const tenantId = activeTenant?.id ?? null;
  return useMutation({
    mutationFn: async (input: PlateLookupInput): Promise<PlateStatus> => {
      const granted = await locationPermissionGranted();
      // Three outcomes, told apart. Until v0.29 "refused", "timed out" and "no signal" all arrived
      // at the server as an absent latitude and none could be distinguished afterwards.
      const fix = granted ? await takePosition(4_000) : null;
      return apiClient.inspectorEnforcement.plateStatus({
        plate: input.plate,
        zoneId: input.zoneId,
        spaceCode: input.spaceCode,
        locationState: granted ? (fix ? 'FIX' : 'NO_FIX') : 'NOT_GRANTED',
        latitude: fix?.latitude,
        longitude: fix?.longitude,
        locationAccuracyM: fix?.accuracyM ?? undefined,
      });
    },
    onSuccess: (status) => {
      rememberZones(tenantId, [
        ...(status.bay ? [status.bay] : []),
        ...(status.coveringStay ? [status.coveringStay] : []),
        ...status.otherStays,
      ]);
      /*
        Y la respuesta misma, para el bloque «Última consulta» del inicio (07-10-2026).

        Va acá, junto al aprendizaje de zonas, porque es el mismo gesto y por el mismo motivo: el
        teléfono guarda lo que el servidor acaba de decirle. No hay endpoint de historial de
        consultas —la bitácora de fiscalización se escribe pero no se publica de vuelta—, así que
        ésta es la única fuente REAL para ese bloque. Ver ./lastLookup.
      */
      rememberLookup(tenantId, status);
    },
  });
}

/**
 * Lo último que este aparato consultó en esta municipalidad, o `null`.
 *
 * <p>`useSyncExternalStore` y no un estado de React: el almacén vive fuera del árbol —lo escribe
 * `usePlateLookup` al recibir la respuesta— y es el mismo mecanismo con el que la pantalla ya lee
 * las zonas y la cola de boletas. Así el bloque se actualiza solo en cuanto llega un veredicto, sin
 * que nadie tenga que acordarse de avisarle.</p>
 */
export function useLastLookup(): LastLookup | null {
  const { activeTenant } = useAuth();
  const tenantId = activeTenant?.id ?? null;
  const subscribe = useCallback((listener: () => void) => subscribeToLastLookup(listener), []);
  const getSnapshot = useCallback(() => lastLookup(tenantId), [tenantId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Seeds the zone directory at app start.
 *
 * The plate lookup is the landing screen and needs a zone before it can ask a conclusive question.
 * Since v0.28 that comes from `GET /inspector/zones`, the endpoint the server had published since
 * v0.7 and nothing called: the app used to learn zones by mining the officer's own past citations,
 * which left a device that had never written one with an empty picker — and an officer with an empty
 * picker can only ever get `AMBIGUOUS`.
 *
 * The learned directory is kept, demoted to what it always really was: the offline cache. The
 * catalogue is written into it on every success, so a phone that loses signal opens its lookup
 * screen with the zones it saw last time instead of nothing. Failures are ignored for the same
 * reason.
 */
export function useZoneDirectorySeed(): void {
  const { apiClient, activeTenant } = useAuth();
  const tenantId = activeTenant?.id ?? null;
  const query = useQuery({
    queryKey: ['inspector', 'zones', tenantId],
    queryFn: () => apiClient.inspectorEnforcement.zones(),
    enabled: Boolean(tenantId),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  useEffect(() => {
    rememberCatalogZones(tenantId, query.data ?? []);
  }, [tenantId, query.data]);
}

/** The zones this device has learned, and a way to re-render when it learns another. */
export function useKnownZones(): KnownZone[] {
  const { activeTenant } = useAuth();
  const tenantId = activeTenant?.id ?? null;
  const subscribe = useCallback((listener: () => void) => subscribeToZones(listener), []);
  const getSnapshot = useCallback(() => knownZones(tenantId), [tenantId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface QueueApi {
  rows: QueuedCitation[];
  pending: number;
  /** Sends everything that is due. Safe to call from anywhere: concurrent flushes collapse into one. */
  flush: () => Promise<void>;
  retryAll: () => void;
}

/**
 * The offline queue as a screen sees it, plus the two triggers that make it feel automatic: the
 * browser's `online` event, and a slow sweep for the case where the connection came back without
 * the event firing (which happens: `navigator.onLine` reports a link, not reachability).
 */
export function useCitationQueue(): QueueApi {
  const { apiClient, activeTenant } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = activeTenant?.id ?? null;

  const subscribe = useCallback((listener: () => void) => subscribeToQueue(listener), []);
  const getSnapshot = useCallback(() => queueSnapshot(tenantId), [tenantId]);
  const rows = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const flush = useCallback(async () => {
    await flushQueue(apiClient, tenantId);
    // A citation that just landed belongs in "my citations" without a manual refresh.
    await queryClient.invalidateQueries({ queryKey: ['inspector', 'citations'] });
  }, [apiClient, queryClient, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    void flush();
    const onOnline = (): void => {
      void flush();
    };
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => {
      void flush();
    }, 20_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [flush, tenantId]);

  return useMemo(
    () => ({
      rows,
      pending: pendingCount(rows),
      flush,
      retryAll: () => {
        retryAllNow(tenantId);
        void flush();
      },
    }),
    [flush, rows, tenantId],
  );
}

/** `navigator.onLine`, watched — the offline state is always visible in the app bar (DESIGN_SYSTEM §5). */
// `useIsOnline` se mudó a `@luparx/features`: el menú «Más» del ciudadano necesita el mismo dato y
// las dos especificaciones del 24-09-2026 piden reutilizar la lógica de conectividad existente en
// vez de copiarla. Se re-exporta desde acá para no tocar los cinco archivos que ya la importaban.
export { useIsOnline } from '@luparx/features';

/**
 * Los avisos de trabajo de esta persona en la municipalidad activa (06-10-2026).
 *
 * <p>Mismo servicio que la campana del ciudadano, otra ruta: `/citizen/notifications` está cerrada con
 * `hasRole('CITIZEN')`, así que acá daría 403, y si se abriera mostraría el buzón de vecino dentro de
 * la aplicación de trabajo.</p>
 */
export function useInspectorNotifications(
  page: number,
  size: number,
): UseQueryResult<PagedResponse<AppNotification>> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: KEYS.notifications(page, size),
    queryFn: () => apiClient.inspectorNotifications.list({ page, size }),
  });
}

/**
 * El número de la campana.
 *
 * <p>Su propia consulta y no un campo de la lista, por lo mismo que en el ciudadano: esto se pregunta
 * desde cualquier pantalla y la lista no.</p>
 *
 * <p>`refetchInterval` NO: un fiscalizador trabaja medio turno sin cobertura y un sondeo que falla
 * cada treinta segundos es batería gastada en reintentos. Se refresca al montar la cabecera y cuando
 * la ventana vuelve al frente, que es cuando alguien podría haber leído algo en otro lado.</p>
 */
export function useInspectorUnreadCount(): UseQueryResult<{ unread: number }> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: KEYS.unreadCount,
    queryFn: () => apiClient.inspectorNotifications.unreadCount(),
    // Un fallo acá no merece reintentos: la insignia ausente es una respuesta correcta.
    retry: false,
  });
}

/** Marcar uno como leído. Invalida el conteo, que es lo que la cabecera muestra. */
export function useMarkInspectorNotificationRead() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.inspectorNotifications.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inspector', 'notifications'] });
    },
  });
}

/** Marcar todos. */
export function useMarkAllInspectorNotificationsRead() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.inspectorNotifications.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inspector', 'notifications'] });
    },
  });
}
