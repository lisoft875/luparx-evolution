package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.CitationNumberCounter;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/**
 * Access to the per-municipality, per-year citation series.
 *
 * <p>The only read is a locking one, and that is deliberate: a caller who read the counter without
 * the lock would be reading a number somebody else is already taking. {@code PESSIMISTIC_WRITE}
 * becomes {@code SELECT … FOR UPDATE}, so concurrent issuers queue in the database rather than
 * racing in application memory — the only version of this that survives more than one instance.</p>
 */
public interface CitationNumberCounterRepository extends JpaRepository<CitationNumberCounter, CitationNumberCounter.Key> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from CitationNumberCounter c where c.tenantId = :tenantId and c.seriesYear = :seriesYear")
    Optional<CitationNumberCounter> lock(@Param("tenantId") UUID tenantId, @Param("seriesYear") int seriesYear);
}
