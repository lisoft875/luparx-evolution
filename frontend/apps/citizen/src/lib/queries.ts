import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import type {
  CreateVehicleRequest,
  ExtendParkingSessionRequest,
  ExtendParkingSessionResponse,
  FinishParkingSessionResponse,
  ParkingPolicy,
  ParkingQuoteResponse,
  ParkingSession,
  StartParkingSessionRequest,
  TimeCreditsResponse,
  UpdateVehicleRequest,
  Vehicle,
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
  return useMutation<ExtendParkingSessionResponse, unknown, { id: string; payload: ExtendParkingSessionRequest }>({
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
  return useMutation<FinishParkingSessionResponse, unknown, string>({
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
