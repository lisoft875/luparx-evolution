package cr.luparx.identity.service;

/**
 * The pair handed to a client after a successful authentication (CONTRACT.md §4).
 *
 * @param accessToken  signed JWT, valid only for the portal in its {@code aud} claim
 * @param refreshToken opaque, single-use, rotated on every refresh
 * @param expiresIn    remaining lifetime of the access token, in seconds
 */
public record IssuedTokens(String accessToken, String refreshToken, long expiresIn) {
}
