package cr.luparx.billing.repository;

import cr.luparx.billing.entity.PaymentCheckout;
import cr.luparx.billing.model.CheckoutState;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaymentCheckoutRepository extends JpaRepository<PaymentCheckout, UUID> {

    /**
     * By the provider's reference and <b>without a tenant</b>.
     *
     * <p>Deliberate, and the one lookup in this module that is not tenant-scoped: a webhook arrives
     * unauthenticated and carrying no municipality. The tenant is a <em>result</em> of this lookup,
     * never an input to it — resolving it from anything the caller sent is the shape of a cross-tenant
     * write. Every caller must then use the tenant found here for everything it does next.</p>
     */
    Optional<PaymentCheckout> findByProviderAndProviderReference(String provider, String providerReference);

    /** Tenant-scoped, for everything a citizen or an administrator reaches. */
    Optional<PaymentCheckout> findByTenantIdAndId(UUID tenantId, UUID id);

    Optional<PaymentCheckout> findByTenantIdAndPaymentId(UUID tenantId, UUID paymentId);

    /** The checkout a citizen came back to, found by the hash of the token in their link. */
    Optional<PaymentCheckout> findByReturnTokenHash(String returnTokenHash);

    /**
     * The card payment this citizen already has in flight in this municipality, if any.
     *
     * <p>The barrier against a double tap becoming two charges. The unique index on {@code payment_id}
     * cannot do it — two taps produce two payments, each legitimately entitled to its own hand-off — so
     * the rule has to be stated at this level: <b>one open hand-off per person per municipality</b>.</p>
     */
    @Query("""
            select c from PaymentCheckout c
            where c.tenantId = :tenantId and c.userId = :userId and c.state = :state
            order by c.createdAt desc
            """)
    List<PaymentCheckout> findOpenOf(@Param("tenantId") UUID tenantId, @Param("userId") UUID userId,
                                     @Param("state") CheckoutState state, Pageable pageable);

    /**
     * Open hand-offs worth asking about, oldest question first.
     *
     * <p>Bounded by attempts as well as by page size: a provider that has stopped answering must not
     * turn into an unbounded loop of calls, and a row that has been asked about twenty times is a row
     * for a person to look at rather than for a job to keep retrying.</p>
     */
    @Query("""
            select c from PaymentCheckout c
            where c.state = :state
              and c.pollAttempts < :maxAttempts
              and (c.lastPolledAt is null or c.lastPolledAt < :notPolledSince)
            order by c.lastPolledAt asc nulls first, c.createdAt asc
            """)
    List<PaymentCheckout> findPollable(@Param("state") CheckoutState state,
                                       @Param("maxAttempts") int maxAttempts,
                                       @Param("notPolledSince") Instant notPolledSince,
                                       Pageable pageable);

    /** Open hand-offs whose window has closed: nothing more will come for them. */
    @Query("""
            select c from PaymentCheckout c
            where c.state = :state and c.expiresAt < :now
            order by c.expiresAt asc
            """)
    List<PaymentCheckout> findExpired(@Param("state") CheckoutState state, @Param("now") Instant now,
                                      Pageable pageable);
}
