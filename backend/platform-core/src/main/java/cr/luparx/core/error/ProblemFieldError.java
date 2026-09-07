package cr.luparx.core.error;

/**
 * One entry of the {@code errors[]} array of a validation Problem Details body (CONTRACT.md §4).
 *
 * <p>Inside the domain, {@code message} carries the i18n <em>key</em> (never a user-visible string,
 * CONTRACT.md §7); the web edge resolves it against the message bundle using the caller's locale
 * before serialising the response.</p>
 *
 * @param field   dotted path of the offending field as the client sent it (e.g. {@code address.level2Id})
 * @param code    stable machine-readable reason (see {@link ErrorCode})
 * @param message i18n key inside the domain, resolved text on the wire
 */
public record ProblemFieldError(String field, String code, String message) {
}
