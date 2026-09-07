package cr.luparx.identity.service;

import cr.luparx.identity.model.FederatedProvider;

/**
 * Claims asserted by an identity provider after a successful authorization-code exchange.
 *
 * @param emailVerified whether the provider states the address was verified; linking is refused
 *                      otherwise, because an unverified provider email would let anyone claim
 *                      someone else's account (ADR 0006)
 */
public record ExternalIdentity(
        FederatedProvider provider,
        String subject,
        String email,
        boolean emailVerified,
        String givenName,
        String familyName) {
}
