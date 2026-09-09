import type { Permission, Role } from '@luparx/api-client';

/**
 * Role -> permission mapping (CONTRACT.md §1: "El rol mapea a permisos en
 * RolePermissions (configuración, no `if (role == ADMIN)`)"). This is the
 * single source of truth on the client; extend it here, never by branching
 * on role name at a call site. The server enforces the same mapping
 * independently — this table only drives what the UI shows/hides.
 *
 * Kept in step with `platform-core` `RolePermissions` (ADR 0014 says so in as many words). The
 * server is the authority and does not depend on this table being right; what a stale copy costs
 * is a button that is shown and then refused, or hidden from someone entitled to it.
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
  PLATFORM_SUPPORT: ['USER_READ', 'AUDIT_READ', 'EXPORT_RUN'],
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
    'CITATION_READ',
    'CITATION_VOID',
    'ENFORCEMENT_MANAGE',
  ],
  // Finance reads citations because collecting on them is its job, and cannot annul one — the
  // separation of duties a municipal auditor asks about first (ADR 0014).
  TENANT_FINANCE: ['USER_READ', 'AUDIT_READ', 'EXPORT_RUN', 'CITATION_READ'],
  TENANT_SUPPORT: ['USER_READ', 'AUDIT_READ', 'CITATION_READ'],
  // The officer writes citations and reads what they wrote. `CITATION_VOID` is deliberately absent:
  // whoever issues an administrative act is not who should be able to erase it.
  INSPECTOR: ['CITATION_ISSUE', 'CITATION_READ'],
  INSPECTOR_LEAD: ['CITATION_ISSUE', 'CITATION_READ', 'CITATION_VOID'],
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
