package cr.luparx.app.payments;

import cr.luparx.app.config.PaymentsProperties;
import cr.luparx.billing.port.PaymentGateway;
import cr.luparx.billing.port.PaymentGatewayRegistry;
import cr.luparx.core.id.TenantId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Resolves which gateway collects, from the deployment's configuration (ADR 0023).
 *
 * <h2>Una implementación de transición, y lo dice</h2>
 *
 * <p>Decision 4 of ADR 0019 is that each municipality collects into its own account, which makes the
 * provider and its credentials a property of the <b>tenant</b>. This implementation ignores the tenant
 * and returns the deployment's single configured adapter. That is the right amount of work today: the
 * simulator has no credentials to isolate, and a table of secrets designed before knowing which secrets
 * a provider asks for is a table that gets migrated.</p>
 *
 * <p>What matters is that the <em>seam</em> is already here. When per-tenant credentials arrive, this
 * class changes and no call site does — which is the whole reason {@link PaymentGatewayRegistry} exists
 * before it is strictly needed.</p>
 */
@Component
public class ConfiguredPaymentGateways implements PaymentGatewayRegistry {

    private static final Logger LOGGER = LoggerFactory.getLogger(ConfiguredPaymentGateways.class);

    private final Map<String, PaymentGateway> byId;
    private final PaymentGateway configured;

    /**
     * Takes an {@link ObjectProvider} and not a {@code List}, deliberately.
     *
     * <p>Spring refuses to inject an empty collection into a required constructor parameter, so a
     * deployment with no adapter wired would fail to start — and "no card provider" must be a working
     * configuration, not an outage. A municipality without cards still charges at its counter.</p>
     */
    public ConfiguredPaymentGateways(ObjectProvider<PaymentGateway> available, PaymentsProperties properties) {
        Map<String, PaymentGateway> index = new HashMap<>();
        for (PaymentGateway gateway : available) {
            index.put(gateway.providerId().toUpperCase(Locale.ROOT), gateway);
        }
        this.byId = Map.copyOf(index);
        this.configured = index.get(properties.provider().toUpperCase(Locale.ROOT));
        if (configured == null) {
            // Not a startup failure: a deployment with no gateway is a perfectly good deployment whose
            // municipalities collect at the counter and through partners. Failing to boot over it would
            // make a missing payment provider take down parking.
            LOGGER.warn("No payment gateway is wired for luparx.payments.provider={}. Card top-ups are "
                    + "unavailable; every other channel works. Registered adapters: {}",
                    properties.provider(), byId.keySet());
        } else {
            LOGGER.info("Payment gateway {} is wired, accepting {}.", configured.providerId(),
                    configured.supportedNetworks());
        }
    }

    @Override
    public Optional<PaymentGateway> forTenant(TenantId tenantId) {
        return Optional.ofNullable(configured);
    }

    @Override
    public Optional<PaymentGateway> byProviderId(String providerId) {
        if (providerId == null || providerId.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(byId.get(providerId.trim().toUpperCase(Locale.ROOT)));
    }
}
