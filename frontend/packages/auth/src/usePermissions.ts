import { useMemo } from 'react';
import type { Permission } from '@luparx/api-client';
import { useAuth } from './context';
import { permissionsForRoles } from './permissions';

export interface PermissionsApi {
  permissions: Set<Permission>;
  has: (permission: Permission) => boolean;
  hasAny: (permissions: readonly Permission[]) => boolean;
}

/** Derives the active permission set from the current access token's roles (CONTRACT.md §1/§3). */
export function usePermissions(): PermissionsApi {
  const { claims } = useAuth();
  const permissions = useMemo(() => permissionsForRoles(claims?.roles ?? []), [claims]);
  return useMemo(
    () => ({
      permissions,
      has: (permission) => permissions.has(permission),
      hasAny: (candidates) => candidates.some((permission) => permissions.has(permission)),
    }),
    [permissions],
  );
}
