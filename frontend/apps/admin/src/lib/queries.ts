import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import type {
  ParkingSchedule,
  ParkingSpaceFormat,
  TenantLocaleSettings,
  UpdateParkingScheduleRequest,
  UpdateParkingSpaceFormatRequest,
  UpdateTenantLocalesRequest,
} from '@luparx/api-client';

/**
 * The three settings a municipal administrator owns (CONTRACT.md v0.3): the languages its portals
 * offer, the shape of a bay code, and when parking is actually charged. All three need
 * `TENANT_MANAGE`, and all three are scoped to the tenant in the access token — no screen here
 * ever passes a tenant id, and no screen could reach another municipality's settings by trying.
 */
const KEYS = {
  locales: ['admin', 'settings', 'locales'] as const,
  spaceFormat: ['admin', 'parking', 'space-format'] as const,
  schedule: ['admin', 'parking', 'schedule'] as const,
};

export function useTenantLocaleSettings(): UseQueryResult<TenantLocaleSettings> {
  const { apiClient } = useAuth();
  return useQuery({ queryKey: KEYS.locales, queryFn: () => apiClient.adminSettings.locales() });
}

export function useUpdateTenantLocales() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TenantLocaleSettings, unknown, UpdateTenantLocalesRequest>({
    mutationFn: (payload) => apiClient.adminSettings.updateLocales(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(KEYS.locales, data);
      // The public list every portal reads is derived from this one.
      void queryClient.invalidateQueries({ queryKey: ['catalog', 'tenant-locales'] });
    },
  });
}

export function useSpaceFormat(): UseQueryResult<ParkingSpaceFormat> {
  const { apiClient } = useAuth();
  return useQuery({ queryKey: KEYS.spaceFormat, queryFn: () => apiClient.adminParking.spaceFormat() });
}

export function useUpdateSpaceFormat() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<ParkingSpaceFormat, unknown, UpdateParkingSpaceFormatRequest>({
    mutationFn: (payload) => apiClient.adminParking.updateSpaceFormat(payload),
    onSuccess: (data) => queryClient.setQueryData(KEYS.spaceFormat, data),
  });
}

export function useParkingScheduleSettings(): UseQueryResult<ParkingSchedule> {
  const { apiClient } = useAuth();
  return useQuery({ queryKey: KEYS.schedule, queryFn: () => apiClient.adminParking.schedule() });
}

export function useUpdateParkingSchedule() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<ParkingSchedule, unknown, UpdateParkingScheduleRequest>({
    mutationFn: (payload) => apiClient.adminParking.updateSchedule(payload),
    onSuccess: (data) => queryClient.setQueryData(KEYS.schedule, data),
  });
}
