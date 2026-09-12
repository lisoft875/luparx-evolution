package cr.luparx.billing.repository;

import cr.luparx.billing.entity.GatewayNotification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface GatewayNotificationRepository extends JpaRepository<GatewayNotification, UUID> {

    /** The provider gave the event an id: that is the identity of the notice. */
    Optional<GatewayNotification> findByProviderAndProviderEventId(String provider, String providerEventId);

    /**
     * Last resort for a provider whose events carry no id.
     *
     * <p>Identical bodies from one provider are the same notice. If they ever were not, the periodic
     * sweep of open checkouts asks the provider again and nothing is lost — which is exactly why this
     * stricter rule is affordable.</p>
     */
    Optional<GatewayNotification> findByProviderAndBodySha256(String provider, String bodySha256);
}
