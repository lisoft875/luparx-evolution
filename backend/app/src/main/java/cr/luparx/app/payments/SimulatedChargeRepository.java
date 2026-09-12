package cr.luparx.app.payments;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * The simulated provider's own store (ADR 0023 §6).
 *
 * <p>Keyed by the provider's reference, like a provider would. No tenant appears in any method here on
 * purpose: a gateway does not know what a municipality is, and a simulator that took a tenant would be
 * quietly stricter than the thing it stands in for.</p>
 */
public interface SimulatedChargeRepository extends JpaRepository<SimulatedCharge, String> {

    /** Idempotency, from the provider's side: the same key is the same charge. */
    Optional<SimulatedCharge> findByIdempotencyKey(String idempotencyKey);
}
