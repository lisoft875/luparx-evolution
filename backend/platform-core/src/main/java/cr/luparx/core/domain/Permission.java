package cr.luparx.core.domain;

/**
 * Fine-grained capabilities (CONTRACT.md §1). Endpoints authorize on a permission, never on a role
 * name, so that changing what a role may do is a configuration change in {@link RolePermissions}
 * rather than an edit scattered across controllers.
 */
public enum Permission {

    USER_READ,
    USER_WRITE,
    USER_BLOCK,
    MEMBERSHIP_APPROVE,
    ROLE_ASSIGN,
    ZONE_ASSIGN,
    AUDIT_READ,
    EXPORT_RUN,
    TENANT_MANAGE,
    PLATFORM_MANAGE,

    // --- enforcement (CONTRACT.md v0.7). Split into three because they are three different jobs:
    // the officer in the street writes citations, the office reads them, and annulling one is an act
    // a municipality does not hand to everybody who can read.
    /** Write a citation: the officer's capability, and only theirs plus their lead's. */
    CITATION_ISSUE,
    /** Read the municipality's citations, filter them and export them. */
    CITATION_READ,
    /** Annul an issued citation, always with a reason. */
    CITATION_VOID,
    /** Configure what the municipality fines and for how much. */
    ENFORCEMENT_MANAGE,

    /**
     * Push citations raised in another system into this one (CONTRACT.md v0.34).
     *
     * <p>Its own capability, held by an integration account and by nobody who walks around. It is
     * not {@code CITATION_ISSUE}: that one raises an administrative act in this municipality's name,
     * and this one only mirrors an act somebody else already raised. Giving the other system the
     * officer's capability would let a misconfigured integration issue real citations, and would
     * leave the municipality unable to answer which of the two systems fined a citizen.</p>
     */
    CITATION_INGEST,

    /**
     * Credit a citizen's wallet at the municipality's counter.
     *
     * <p>Its own capability rather than "whatever an administrator may do": handing out money is the
     * cashier's job and the auditor's first question, and a municipality must be able to give it to
     * the person at the window without also giving them user administration.
     */
    WALLET_TOPUP,

    /**
     * Dar por bueno el perímetro de una zona de cobro (CONTRACT.md v0.44, ADR 0029).
     *
     * <p>Separado de {@link #TENANT_MANAGE} —que es el que DIBUJA— porque dibujar un límite y
     * declararlo oficial son dos actos distintos. El segundo es el que decide por qué calle se
     * cobra: mientras un perímetro no esté verificado, el mapa del ciudadano no lo recibe. Que la
     * misma persona pueda hacer los dos es una decisión que cada municipalidad toma; que el sistema
     * NO PUEDA distinguirlos sería una decisión nuestra, y es la que esta separación evita.</p>
     *
     * <p>Hoy la tabla se lo da a {@link Role#TENANT_ADMIN}, porque si no nadie podría verificar
     * nada y el mapa quedaría vacío para siempre. Una municipalidad que quiera separación de
     * funciones de verdad se lo quita a ese rol y se lo da a otro: <b>una línea en
     * {@link RolePermissions}</b>, sin tocar ningún controlador, porque el extremo autoriza sobre
     * este permiso y nunca sobre un nombre de rol.</p>
     */
    ZONE_GEOMETRY_VERIFY;

    /** Authority name exposed to Spring Security expressions ({@code hasAuthority('PERM_USER_READ')}). */
    public String authority() {
        return "PERM_" + name();
    }
}
