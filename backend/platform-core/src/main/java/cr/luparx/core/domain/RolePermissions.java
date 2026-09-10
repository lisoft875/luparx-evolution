package cr.luparx.core.domain;

import java.util.Collection;
import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Role -> permission table (CONTRACT.md §1: "El rol mapea a permisos en RolePermissions
 * (configuración, no {@code if (role == ADMIN)})"). This mirrors the client-side table in
 * {@code frontend/packages/auth/src/permissions.ts}; the server table is the authoritative one and
 * is enforced independently of anything the client believes.
 *
 * <p>Inspector permissions were intentionally empty until v0.7. The enforcement capabilities arrive
 * with module-enforcement and are added <em>here</em>, as configuration, rather than by branching on
 * the role name at a call site — which is the whole point of the table.</p>
 */
public final class RolePermissions {

    private static final Map<Role, Set<Permission>> TABLE = buildTable();

    private RolePermissions() {
    }

    private static Map<Role, Set<Permission>> buildTable() {
        EnumMap<Role, Set<Permission>> table = new EnumMap<>(Role.class);
        table.put(Role.PLATFORM_ADMIN, EnumSet.allOf(Permission.class));
        table.put(Role.PLATFORM_SUPPORT, EnumSet.of(
                Permission.USER_READ,
                Permission.AUDIT_READ,
                Permission.EXPORT_RUN));
        table.put(Role.TENANT_ADMIN, EnumSet.of(
                Permission.USER_READ,
                Permission.USER_WRITE,
                Permission.USER_BLOCK,
                Permission.MEMBERSHIP_APPROVE,
                Permission.ROLE_ASSIGN,
                Permission.ZONE_ASSIGN,
                Permission.AUDIT_READ,
                Permission.EXPORT_RUN,
                Permission.TENANT_MANAGE,
                Permission.CITATION_READ,
                Permission.CITATION_VOID,
                Permission.ENFORCEMENT_MANAGE,
                // So an administrator can map foreign causals and load a backlog by hand; the
                // day-to-day pushing is the integration account's job.
                Permission.CITATION_INGEST,
                Permission.WALLET_TOPUP));
        // Finance reads citations because collecting on them is its job; it cannot annul one, which
        // is precisely the separation of duties a municipality's own auditor asks about.
        // Finance is the counter: it credits wallets and reads citations, and it still cannot annul
        // one. Endpoints authorise on PERM_WALLET_TOPUP, never on a role name, so a municipality that
        // wants a dedicated cashier role gets it by editing this table and nothing else.
        table.put(Role.TENANT_FINANCE, EnumSet.of(
                Permission.USER_READ,
                Permission.AUDIT_READ,
                Permission.EXPORT_RUN,
                Permission.CITATION_READ,
                Permission.WALLET_TOPUP));
        table.put(Role.TENANT_SUPPORT, EnumSet.of(
                Permission.USER_READ,
                Permission.AUDIT_READ,
                Permission.CITATION_READ));
        // The officer writes citations and reads what they wrote. Annulment is deliberately not
        // here: the person who issued an act is not the person who should be able to erase it.
        table.put(Role.INSPECTOR, EnumSet.of(
                Permission.CITATION_ISSUE,
                Permission.CITATION_READ));
        table.put(Role.INSPECTOR_LEAD, EnumSet.of(
                Permission.CITATION_ISSUE,
                Permission.CITATION_READ,
                Permission.CITATION_VOID));
        // Two capabilities and not one more. It mirrors citations in and reads them back so it can
        // reconcile; everything else an integration might "need" is a conversation, not a default.
        table.put(Role.TENANT_INTEGRATION, EnumSet.of(
                Permission.CITATION_INGEST,
                Permission.CITATION_READ));
        table.put(Role.CITIZEN, EnumSet.noneOf(Permission.class));

        EnumMap<Role, Set<Permission>> immutable = new EnumMap<>(Role.class);
        for (Map.Entry<Role, Set<Permission>> entry : table.entrySet()) {
            immutable.put(entry.getKey(), Collections.unmodifiableSet(EnumSet.copyOf(entry.getValue())));
        }
        return Collections.unmodifiableMap(immutable);
    }

    /** Permissions granted by a single role. Never null; empty for roles with no capability yet. */
    public static Set<Permission> of(Role role) {
        Set<Permission> permissions = TABLE.get(role);
        return permissions == null ? Collections.emptySet() : permissions;
    }

    /** Union of the permissions granted by every role in the collection. */
    public static Set<Permission> of(Collection<Role> roles) {
        EnumSet<Permission> union = EnumSet.noneOf(Permission.class);
        if (roles != null) {
            for (Role role : roles) {
                union.addAll(of(role));
            }
        }
        return Collections.unmodifiableSet(union);
    }

    public static boolean grants(Role role, Permission permission) {
        return of(role).contains(permission);
    }

    public static boolean grants(Collection<Role> roles, Permission permission) {
        return of(roles).contains(permission);
    }

    /** Full table, exposed read-only for the platform back-office and for documentation. */
    public static Map<Role, Set<Permission>> table() {
        return TABLE;
    }
}
