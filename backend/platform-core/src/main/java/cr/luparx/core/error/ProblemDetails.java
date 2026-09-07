package cr.luparx.core.error;

import java.util.List;

/**
 * RFC 9457 Problem Details body, serialised as {@code application/problem+json} (CONTRACT.md §4,
 * ADR 0011). {@code code} is the stable identifier clients branch on; {@code traceId} correlates the
 * response with the structured logs and with {@code audit_events} (docs/ARCHITECTURE.md §6).
 *
 * <p>Null members are omitted from the JSON by the application-wide Jackson configuration.</p>
 */
public record ProblemDetails(
        String type,
        String title,
        int status,
        String detail,
        String instance,
        String code,
        String traceId,
        List<ProblemFieldError> errors) {

    /** Default {@code type} URI namespace; a code-specific URI keeps the body self-describing. */
    public static final String TYPE_BASE = "https://docs.luparx.cr/errors/";

    public static String typeFor(String code) {
        return TYPE_BASE + code;
    }
}
