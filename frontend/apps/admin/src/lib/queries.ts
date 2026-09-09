import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useAuth } from '@luparx/auth';
import type {
  AdminCitationsQuery,
  Citation,
  CitationDetail,
  InfractionType,
  InfractionTypeDraft,
  PagedResponse,
  PageParams,
  ParkingSchedule,
  ParkingZone,
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

// ---- Enforcement (CONTRACT.md v0.7, ADR 0014) --------------------------------------------------
// Two capabilities, deliberately apart: `CITATION_READ` for finance and support, who collect on
// citations and answer the phone about them, and `CITATION_VOID` for whoever may annul an act.
// The server checks both independently; the screens only decide what to show.

const ENFORCEMENT_KEYS = {
  citations: (query: AdminCitationsQuery & PageParams) => ['admin', 'enforcement', 'citations', query] as const,
  citation: (id: string) => ['admin', 'enforcement', 'citation', id] as const,
  infractionTypes: ['admin', 'enforcement', 'infraction-types'] as const,
  zones: ['admin', 'parking', 'zones'] as const,
};

export function useEnforcementCitations(
  query: AdminCitationsQuery & PageParams,
): UseQueryResult<PagedResponse<Citation>> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: ENFORCEMENT_KEYS.citations(query),
    queryFn: () => apiClient.adminEnforcement.citations(query),
    // A list of administrative acts is read while somebody is on the phone about one of them:
    // keeping the previous page on screen while the next loads is what stops the table flickering
    // to empty between filter changes.
    placeholderData: (previous) => previous,
  });
}

export function useEnforcementCitation(id: string | undefined): UseQueryResult<CitationDetail> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: ENFORCEMENT_KEYS.citation(id ?? ''),
    queryFn: () => apiClient.adminEnforcement.get(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Annulment. The reason is required by the server and by the screen, and it lands on the citation,
 * in its history and in the audit trail — which is why there is no "quick cancel" anywhere.
 */
export function useCancelCitation() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CitationDetail, unknown, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => apiClient.adminEnforcement.cancel(id, { reason }),
    onSuccess: (detail) => {
      queryClient.setQueryData(ENFORCEMENT_KEYS.citation(detail.citation.id), detail);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'enforcement', 'citations'] });
    },
  });
}

/** The whole catalogue, retired kinds included: the administrator edits what exists, not what is live. */
export function useInfractionTypes(): UseQueryResult<InfractionType[]> {
  const { apiClient } = useAuth();
  return useQuery({
    queryKey: ENFORCEMENT_KEYS.infractionTypes,
    queryFn: () => apiClient.adminEnforcement.infractionTypes(),
  });
}

export function useUpdateInfractionTypes() {
  const { apiClient } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<InfractionType[], unknown, InfractionTypeDraft[]>({
    mutationFn: (drafts) => apiClient.adminEnforcement.updateInfractionTypes(drafts),
    onSuccess: (types) => {
      queryClient.setQueryData(ENFORCEMENT_KEYS.infractionTypes, types);
      // The officer's picker reads the active subset of exactly this catalogue.
      void queryClient.invalidateQueries({ queryKey: ['inspector', 'infraction-types'] });
    },
  });
}

/** Zones, for the citations filter. Already available to an administrator via `/admin/parking/zones`. */
export function useAdminZones(): UseQueryResult<ParkingZone[]> {
  const { apiClient } = useAuth();
  return useQuery({ queryKey: ENFORCEMENT_KEYS.zones, queryFn: () => apiClient.adminParking.zones() });
}
