import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import { useVehicleColors, useVehicleTypes } from '@luparx/features';
import { ApiError } from '@luparx/api-client';
import type {
  AdministrativeDivision,
  ChangeEmailRequest,
  ChangePasswordRequest,
  CreateVehicleRequest,
  ExtendParkingSessionRequest,
  MeResponse,
  ParkingPolicy,
  ParkingQuoteResponse,
  ParkingSchedule,
  ParkingSession,
  ParkingSpaceFormat,
  ParkingZone,
  StartParkingSessionRequest,
  TimeCreditsResponse,
  UpdateProfileRequest,
  UpdateVehicleRequest,
  Vehicle,
  VehicleAttributeCatalogEntry,
  WalletResponse,
} from '@luparx/api-client';

/**
 * TanStack Query hooks over the citizen v0.2 parking domain (CONTRACT.md §API). Every screen
 * talks to these, never to `apiClient.citizen*` directly, so cache keys and invalidation stay in
 * one place — see each mutation's `onSuccess` for exactly what CONTRACT.md's "misma transacción"
 * server-side invariant requires the client to refresh (wallet balance, time credits, sessions).
 */
const KEYS = {
  vehicles: ['citizen', 'vehicles'] as const,
  policy: ['citizen', 'parking', 'policy'] as const,
  activeSessions: ['citizen', 'parking', 'sessions', 'ACTIVE'] as const,
  quote: (zoneId: string, minutes: number) => ['citizen', 'parking', 'quote', zoneId, minutes] as const,
  wallet: ['citizen', 'wallet'] as const,
  timeCredits: ['citizen', 'time-credits'] as const,
  schedule: ['citizen', 'parking', 'schedule'] as const,
  zones: ['citizen', 'parking', 'zones'] as const,
  spaceFormat: ['citizen', 'parking', 'space-format'] as const,
};

export function useVehicles(): UseQueryResult<Vehicle[]> {
  const { apiClient } = useAuth();
  return useQuery({ queryKey: KEYS.vehicles, queryFn: () => apiClient.citizenVehicles.list() });
}

export function useCreateVehicle() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVehicleRequest) => apiClient.citizenVehicles.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.vehicles }),
  });
}

export function useUpdateVehicle() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateVehicleRequest }) =>
      apiClient.citizenVehicles.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.vehicles }),
  });
}

export function useSetPrimaryVehicle() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.citizenVehicles.setPrimary(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.vehicles }),
  });
}

export function useDeleteVehicle() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.citizenVehicles.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEYS.vehicles }),
  });
}

export function useParkingPolicy(): UseQueryResult<ParkingPolicy> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: KEYS.policy,
    queryFn: () => apiClient.citizenParking.policy(),
    staleTime: 5 * 60_000,
  });
}

/** Every session across every tenant the citizen belongs to (CONTRACT.md v0.2 rule 3 — the sticky timer is tenant-agnostic), polled so an externally-expiring session eventually drops off. */
export function useActiveParkingSessions(): UseQueryResult<ParkingSession[]> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: KEYS.activeSessions,
    queryFn: () => apiClient.citizenParking.sessions({ status: 'ACTIVE' }),
    refetchInterval: 30_000,
  });
}

/** Live quote for the zone/duration currently selected in the parking flow — server-computed, never estimated client-side (CONTRACT.md v0.2 §Invariantes). */
export function useParkingQuote(zoneId: string | null, minutes: number | null): UseQueryResult<ParkingQuoteResponse> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: KEYS.quote(zoneId ?? '', minutes ?? 0),
    queryFn: () => apiClient.citizenParking.quote({ zoneId: zoneId!, minutes: minutes! }),
    enabled: Boolean(zoneId) && Boolean(minutes) && minutes! > 0,
  });
}

export function useStartParkingSession() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StartParkingSessionRequest) => apiClient.citizenParking.start(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.activeSessions });
      void queryClient.invalidateQueries({ queryKey: KEYS.wallet });
      void queryClient.invalidateQueries({ queryKey: KEYS.timeCredits });
    },
  });
}

export function useExtendParkingSession() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<ParkingSession, unknown, { id: string; payload: ExtendParkingSessionRequest }>({
    mutationFn: ({ id, payload }) => apiClient.citizenParking.extend(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.activeSessions });
      void queryClient.invalidateQueries({ queryKey: KEYS.wallet });
    },
  });
}

export function useFinishParkingSession() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<ParkingSession, unknown, string>({
    mutationFn: (id) => apiClient.citizenParking.finish(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.activeSessions });
      void queryClient.invalidateQueries({ queryKey: KEYS.timeCredits });
    },
  });
}

export function useWallet(): UseQueryResult<WalletResponse> {
  const { apiClient } = useAuth();
  return useQuery({ queryKey: KEYS.wallet, queryFn: () => apiClient.citizenWallet.get() });
}

export function useTimeCredits(): UseQueryResult<TimeCreditsResponse> {
  const { apiClient } = useAuth();
  return useQuery({ queryKey: KEYS.timeCredits, queryFn: () => apiClient.citizenTimeCredits.get() });
}

/**
 * The municipality's charging schedule (CONTRACT.md v0.3 §"Horario de cobro"). Refetched on a
 * timer because `chargingNow` is a point-in-time answer: a screen left open across 18:00 has to
 * stop telling the citizen they are about to be charged.
 */
export function useParkingSchedule(): UseQueryResult<ParkingSchedule> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: KEYS.schedule,
    queryFn: () => apiClient.citizenParking.schedule(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/**
 * Zones the citizen can park in.
 *
 * TODO(backend): there is no `GET /citizen/parking/zones` yet — the list is only published under
 * `/admin/parking/zones`, behind `TENANT_MANAGE` — while `POST /quote` and `POST /sessions` both
 * require a `zoneId`. Until the endpoint exists this degrades to the zones the citizen has
 * already parked in, read from their own session history, and the parking screen says plainly
 * when that leaves it with nothing to offer. No zone is ever invented client-side: a made-up id
 * would only fail later, at the moment of charging.
 */
export function useParkingZones(): UseQueryResult<ParkingZone[]> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: KEYS.zones,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        return await apiClient.citizenParking.zones();
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
        const history = await apiClient.citizenParking.sessions({ status: 'ALL' });
        const byId = new Map<string, ParkingZone>();
        for (const session of history) {
          if (!byId.has(session.zoneId)) {
            byId.set(session.zoneId, { id: session.zoneId, code: session.zoneId, name: session.zoneName });
          }
        }
        return [...byId.values()];
      }
    },
  });
}

/**
 * The municipality's bay-code format (CONTRACT.md v0.3 §"Formato del código de espacio").
 *
 * The citizen's field uses it for two things the server would otherwise have to be asked about: the
 * example it shows ("0001" in San José, "E-0001" in Escazú) and the regex it checks a typed code
 * against before spending a round trip on a code that cannot exist. It is configuration, not state:
 * long `staleTime`, and dropped wholesale when the municipality changes (TenantCacheReset).
 */
export function useParkingSpaceFormat(): UseQueryResult<ParkingSpaceFormat> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: KEYS.spaceFormat,
    queryFn: () => apiClient.citizenParking.spaceFormat(),
    staleTime: 10 * 60_000,
  });
}

/** Vehicle types/colours, from the platform catalog — see `@luparx/features`. */
export function useVehicleTypeCatalog(): UseQueryResult<VehicleAttributeCatalogEntry[]> {
  const { apiClient } = useAuth();
  return useVehicleTypes(apiClient);
}

export function useVehicleColorCatalog(): UseQueryResult<VehicleAttributeCatalogEntry[]> {
  const { apiClient } = useAuth();
  return useVehicleColors(apiClient);
}

/**
 * One level of a country's administrative divisions (`GET /catalog/countries/{code}/divisions`).
 *
 * The account screen shows an address as the person would write it — "San José, Escazú, San
 * Rafael" — while the profile stores only the division ids, so the names have to be looked up.
 * The catalog is public and slow-moving, hence the long `staleTime`; the query stays disabled
 * until its parent is known, so the cascade is never asked for children of nothing.
 */
export function useDivisions(
  countryCode: string | undefined,
  level: number,
  parentId: string | undefined,
): UseQueryResult<AdministrativeDivision[]> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: ['catalog', 'divisions', countryCode ?? '', level, parentId ?? 'root'],
    queryFn: () => apiClient.catalog.divisions(countryCode as string, { level, parentId }),
    enabled: Boolean(countryCode) && (level === 1 || Boolean(parentId)),
    staleTime: 10 * 60_000,
  });
}

// ---- Account (CONTRACT.md v0.3 §"Perfil editable") ---------------------------------------------

/**
 * Saves the personal data of CONTRACT.md §2. The server answers with the whole `/me` payload, so
 * the auth context is refreshed from that answer rather than from what the form believed it sent.
 */
export function useUpdateProfile() {
  const { apiClient, refreshProfile } = useAuth();
  return useMutation<MeResponse, unknown, UpdateProfileRequest>({
    mutationFn: (payload) => apiClient.session.updateMe(payload),
    onSuccess: () => {
      void refreshProfile();
    },
  });
}

/** Changing the password signs every other session out (CONTRACT.md v0.3 §1.3) — the screen says so before submitting. */
export function useChangePassword() {
  const { apiClient } = useAuth();
  return useMutation<void, unknown, ChangePasswordRequest>({
    mutationFn: (payload) => apiClient.session.changePassword(payload),
  });
}

/** Starts the e-mail change; the current address keeps working until the new one is verified. */
export function useChangeEmail() {
  const { apiClient } = useAuth();
  return useMutation<void, unknown, ChangeEmailRequest>({
    mutationFn: (payload) => apiClient.session.changeEmail(payload),
  });
}

/**
 * The time zone every parking time is stated in.
 *
 * The municipality's, not the device's (CONTRACT.md v0.3 §"Horario de cobro"): a stay bought in
 * San José expires at a San José clock time, whatever the phone is set to. Falls back to the
 * account's own zone while the schedule is still loading, and to the device only if neither is
 * known — never a hardcoded zone.
 */
export function useTenantTimeZone(): string | undefined {
  const { me } = useAuth();
  const { data: schedule } = useParkingSchedule();
  return schedule?.timeZone ?? me?.user.timeZone ?? undefined;
}
