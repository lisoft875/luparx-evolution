package cr.luparx.core.audit;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * Collects what changed between two versions of something, field by field (CONTRACT.md v0.32).
 *
 * <p>A builder rather than a reflective diff of two objects, and that is the whole design. Reflection
 * would record every field an entity happens to carry — version counters, timestamps, internal
 * identifiers — and would copy personal data into a table that is never deleted, the moment somebody
 * adds a column. Naming the fields at the call site means the trail says exactly what the people who
 * wrote the feature considered worth answering for.</p>
 *
 * <p>Unchanged fields are dropped. An entry that says "name: Centro → Centro" is noise in the one
 * place noise is most expensive, because nobody may ever delete it.</p>
 *
 * <pre>{@code
 * auditRecorder.record(action, "parking-zone", id.toString(), metadata,
 *         AuditChanges.builder()
 *                 .compare("sessionMaxMinutes", before.getSessionMaxMinutes(), after.getSessionMaxMinutes())
 *                 .compareMasked("email", before.getEmail(), after.getEmail())
 *                 .build());
 * }</pre>
 */
public final class AuditChanges {

    /** Longest value kept. Beyond this it is a document, not a value somebody reads in a table. */
    private static final int MAX_VALUE = 500;

    private final List<AuditChange> changes = new ArrayList<>();

    private AuditChanges() {
    }

    public static AuditChanges builder() {
        return new AuditChanges();
    }

    /** No changes at all — the ordinary shape for an action that creates or reads something. */
    public static List<AuditChange> none() {
        return List.of();
    }

    /**
     * Records a field, if and only if it changed.
     *
     * <p>Values are compared as text, which is what they are stored as. Two numbers that print the
     * same are the same number, and a list that was reordered without changing its contents is
     * handled by the caller passing a canonical form — this class must not decide that {@code
     * [30,60]} and {@code [60,30]} are the same thing, because in an increments list they are and in
     * a priority list they are not.</p>
     */
    public AuditChanges compare(String field, Object before, Object after) {
        return record(field, text(before), text(after), false);
    }

    /**
     * The same, for a <b>personal identifier</b>: an email address, an identity document, a phone.
     *
     * <p>The values are reduced before they are stored. That the address changed is what an auditor
     * needs and is what makes the action accountable; what it used to be is a copy of somebody's
     * personal data in a table with no retention (SECURITY.md §11). Reducing rather than omitting is
     * deliberate: an entry that says only "email changed" cannot be told apart from a typo fix, and
     * {@code a***@example.com → b***@example.com} can.</p>
     */
    public AuditChanges compareMasked(String field, Object before, Object after) {
        String from = text(before);
        String to = text(after);
        if (Objects.equals(from, to)) {
            return this;
        }
        return record(field, mask(from), mask(to), true);
    }

    /** A field whose new value is worth recording although there was nothing before it. */
    public AuditChanges set(String field, Object after) {
        return compare(field, null, after);
    }

    /**
     * Si no cambió ni un campo.
     *
     * <p>Existe para que quien llama pueda decidir <b>no registrar nada</b>. Guardar un formulario
     * sin tocarlo produce una comparación vacía, y hasta el 25-09-2026 eso igual escribía un evento
     * «actualizado» con un guion en «Qué cambió». Una bitácora es evidencia: una fila que afirma una
     * modificación que no ocurrió no es un detalle cosmético, es ruido en el único lugar donde el
     * ruido no se puede borrar después.</p>
     *
     * <p>No se resuelve dentro de {@code AuditRecorder} porque no toda acción sin cambios sobra: una
     * consulta, una aprobación o una exportación no cambian ningún campo y sí deben quedar
     * registradas. Sólo quien escribe la acción sabe si «sin diferencias» significa «no pasó
     * nada».</p>
     */
    public boolean isEmpty() {
        return changes.isEmpty();
    }

    public List<AuditChange> build() {
        return List.copyOf(changes);
    }

    private AuditChanges record(String field, String from, String to, boolean masked) {
        if (Objects.equals(from, to)) {
            return this;
        }
        changes.add(new AuditChange(field, truncate(from), truncate(to), masked));
        return this;
    }

    private static String text(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Iterable<?> values) {
            StringBuilder builder = new StringBuilder();
            for (Object element : values) {
                if (builder.length() > 0) {
                    builder.append(", ");
                }
                builder.append(element);
            }
            return builder.toString();
        }
        return String.valueOf(value);
    }

    private static String truncate(String value) {
        if (value == null || value.length() <= MAX_VALUE) {
            return value;
        }
        return value.substring(0, MAX_VALUE - 1) + "…";
    }

    /**
     * Keeps the shape and loses the identity: {@code maria@example.com} becomes {@code m***@example.com},
     * {@code 1-0876-0543} becomes {@code 1********3}.
     *
     * <p>The domain of an address is kept because it is what makes a change legible — moving somebody
     * from a personal mailbox to a municipal one is the kind of thing an auditor is looking for — and
     * a domain is not a person.</p>
     */
    private static String mask(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        int at = value.indexOf('@');
        if (at > 0) {
            String local = value.substring(0, at);
            return local.charAt(0) + "***" + value.substring(at).toLowerCase(Locale.ROOT);
        }
        if (value.length() <= 2) {
            return "*".repeat(value.length());
        }
        return value.charAt(0) + "*".repeat(value.length() - 2) + value.charAt(value.length() - 1);
    }
}
