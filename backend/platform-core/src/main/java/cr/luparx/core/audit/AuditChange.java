package cr.luparx.core.audit;

/**
 * One field that changed, with what it was and what it became (CONTRACT.md v0.32).
 *
 * <p>Only fields that <b>actually</b> changed are recorded. Storing the whole row before and after
 * would copy personal data nobody touched into a table that is never deleted, and would leave
 * whoever audits comparing two photographs to find the one field that matters.</p>
 *
 * <p>Both values are strings, deliberately. This is a record of what a person did, read by a person;
 * "480 → 120" is what an auditor needs, and preserving the original types would buy a query nobody
 * writes at the cost of a shape nobody can read.</p>
 *
 * @param field the name as the API and the screen call it, so an auditor can find it
 * @param oldValue what it was; null means it had no value
 * @param newValue what it became; null means it was cleared
 * @param masked whether the two values were reduced before being stored, because the field is a
 *               personal identifier. That the email changed is auditable; what it was is not
 *               (SECURITY.md §11), and the flag is what stops a reader taking {@code a***@x.com} for
 *               the address itself
 */
public record AuditChange(String field, String oldValue, String newValue, boolean masked) {

    public AuditChange {
        if (field == null || field.isBlank()) {
            throw new IllegalArgumentException("an audit change names the field that changed");
        }
    }
}
