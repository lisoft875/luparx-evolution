package cr.luparx.billing.port;

import cr.luparx.core.id.TenantId;

import java.util.Optional;

/**
 * Which gateway collects for which municipality (ADR 0023).
 *
 * <h2>Por tenant desde el primer día, aunque hoy haya uno solo</h2>
 *
 * <p>Decision 4 of ADR 0019 is that <b>each municipality collects into its own account</b> — the
 * provider deposits directly to the council and LupaRX never holds the money. That makes the provider
 * and its credentials a property of the tenant, not of the deployment, and a resolution step that
 * does not exist today is a resolution step that has to be threaded through every call site later.
 * So it exists now, with an implementation that returns the deployment's configured provider.</p>
 *
 * <p>A municipality with no provider configured is a normal state and not an error here: it collects
 * at its counter and through partners, and its citizens simply are not offered the card. Returning an
 * empty result rather than throwing is what lets the citizen portal say "not available here" instead
 * of showing a failure.</p>
 */
public interface PaymentGatewayRegistry {

    /** The gateway that collects for this municipality, if any is configured for it. */
    Optional<PaymentGateway> forTenant(TenantId tenantId);

    /**
     * The gateway registered under this identifier, regardless of tenant.
     *
     * <p>For the webhook endpoint, which is reached by provider and not by municipality: the tenant is
     * only known after the notification has been authenticated and its payment looked up. Resolving a
     * tenant from anything an unauthenticated caller sent would be the mistake.</p>
     */
    Optional<PaymentGateway> byProviderId(String providerId);
}
