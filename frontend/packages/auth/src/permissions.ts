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
    // Mirror citations from another system, and map their causals (v0.34).
    'CITATION_INGEST',
    // The counter, and since v0.35 the reconciliation screen with it. This was missing from this
    // table while the server had granted it since v0.8 — a stale copy costs exactly this: a
    // capability somebody holds and a screen the client will not show them.
    'WALLET_TOPUP',
  ],
  // Finance reads citations because collecting on them is its job, and cannot annul one — the
  // separation of duties a municipal auditor asks about first (ADR 0014). It credits wallets at the
  // counter and reconciles what came in, which is the whole of the finance job here.
  TENANT_FINANCE: ['USER_READ', 'AUDIT_READ', 'EXPORT_RUN', 'CITATION_READ', 'WALLET_TOPUP'],
  TENANT_SUPPORT: ['USER_READ', 'AUDIT_READ', 'CITATION_READ'],
  // The officer writes citations and reads what they wrote. `CITATION_VOID` is deliberately absent:
  // whoever issues an administrative act is not who should be able to erase it.
  INSPECTOR: ['CITATION_ISSUE', 'CITATION_READ'],
  INSPECTOR_LEAD: ['CITATION_ISSUE', 'CITATION_READ', 'CITATION_VOID'],
  // A machine, not a person (v0.34): it mirrors citations in and reads them back, and nothing else.
  TENANT_INTEGRATION: ['CITATION_INGEST', 'CITATION_READ'],
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

/**
 * Todos los roles que el cliente conoce, en el orden en que una municipalidad los piensa.
 *
 * <h2>Por qué sale de la tabla de permisos y no es una lista aparte</h2>
 *
 * <p>Porque una lista aparte se queda vieja en silencio, y ya se había quedado: el filtro de
 * `/admin/users` traía siete roles escritos a mano y el tipo `Role` tiene nueve. `PLATFORM_SUPPORT`
 * y `TENANT_INTEGRATION` existían en el servidor, existían en el tipo, y no se podía filtrar por
 * ellos — sin que nada fallara, que es lo peor de este tipo de defecto.</p>
 *
 * <p>`ROLE_PERMISSIONS` es un `Record<Role, …>`, así que el compilador EXIGE una entrada por rol:
 * añadir un rol al tipo obliga a darle permisos, y con eso aparece solo en cualquier lista que
 * salga de acá. Es la misma razón por la que esa tabla existe en vez de un `if (role == ADMIN)`.</p>
 *
 * <p>El orden es el de la declaración del objeto, que es el orden del trabajo: la plataforma, la
 * municipalidad, el campo y el ciudadano. No alfabético — alfabético pone «CITIZEN» primero y
 * separa a los dos fiscalizadores.</p>
 */
export const ROLES: readonly Role[] = Object.keys(ROLE_PERMISSIONS) as Role[];
