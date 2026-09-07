import type { Permission, Role } from '@luparx/api-client';

/**
 * Role -> permission mapping (CONTRACT.md §1: "El rol mapea a permisos en
 * RolePermissions (configuración, no `if (role == ADMIN)`)"). This is the
 * single source of truth on the client; extend it here, never by branching
 * on role name at a call site. The server enforces the same mapping
 * independently — this table only drives what the UI shows/hides.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PLATFORM_ADMIN: [
    'USER_READ',
    'USER_WRITE',
    'USER_BLOCK',
    'MEMBERSHIP_APPROVE',
    'ROLE_ASSIGN',
    'ZONE_ASSIGN',
    'AUDIT_READ',
    'EXPORT_RUN',
    'TENANT_MANAGE',
    'PLATFORM_MANAGE',
  ],
  // Read-only + support scope (CONTRACT.md §1): sees everything PLATFORM_ADMIN sees, changes nothing.
  PLATFORM_SUPPORT: ['USER_READ', 'AUDIT_READ'],
  TENANT_ADMIN: [
    'USER_READ',
    'USER_WRITE',
    'USER_BLOCK',
    'MEMBERSHIP_APPROVE',
    'ROLE_ASSIGN',
    'ZONE_ASSIGN',
    'AUDIT_READ',
    'EXPORT_RUN',
    'TENANT_MANAGE',
  ],
  TENANT_FINANCE: ['USER_READ', 'AUDIT_READ', 'EXPORT_RUN'],
  TENANT_SUPPORT: ['USER_READ', 'AUDIT_READ'],
  // TODO(extension): patrol/zone domain permissions for inspector roles arrive with module-parking.
  INSPECTOR: [],
  INSPECTOR_LEAD: [],
  CITIZEN: [],
};

export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const permissions = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) {
      permissions.add(permission);
    }
  }
  return permissions;
}
