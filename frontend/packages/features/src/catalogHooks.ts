import { useQuery } from '@tanstack/react-query';
import type { ApiClient } from '@luparx/api-client';

/**
 * Public catalog endpoints (CONTRACT.md §4) are cacheable and unauthenticated;
 * a long `staleTime` avoids refetching countries/admin-levels on every
 * navigation while still refreshing if the user keeps the tab open for hours.
 */
const CATALOG_STALE_TIME_MS = 10 * 60 * 1000;

export function useCountries(apiClient: ApiClient) {
  return useQuery({
    queryKey: ['catalog', 'countries'],
    queryFn: () => apiClient.catalog.countries(),
    staleTime: CATALOG_STALE_TIME_MS,
  });
}

export function useAdminLevels(apiClient: ApiClient, countryCode: string | undefined) {
  return useQuery({
    queryKey: ['catalog', 'admin-levels', countryCode],
    queryFn: () => apiClient.catalog.adminLevels(countryCode as string),
    enabled: !!countryCode,
    staleTime: CATALOG_STALE_TIME_MS,
  });
}

export function useDocumentTypes(apiClient: ApiClient, countryCode: string | undefined) {
  return useQuery({
    queryKey: ['catalog', 'document-types', countryCode],
    queryFn: () => apiClient.catalog.documentTypes(countryCode as string),
    enabled: !!countryCode,
    staleTime: CATALOG_STALE_TIME_MS,
  });
}

export function useTenants(apiClient: ApiClient, countryCode: string | undefined) {
  return useQuery({
    queryKey: ['catalog', 'tenants', countryCode],
    queryFn: () => apiClient.catalog.tenants(countryCode),
    staleTime: CATALOG_STALE_TIME_MS,
  });
}
