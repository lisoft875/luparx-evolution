package cr.luparx.app.audit;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** The audit chains. Append-only in the application and append-only in the database (V31_0). */
public interface AuditSealRepository extends JpaRepository<AuditSeal, UUID> {

    Optional<AuditSeal> findFirstByTenantKeyOrderBySeqDesc(UUID tenantKey);

    List<AuditSeal> findByTenantKeyOrderBySeqAsc(UUID tenantKey);

    /** The most recent links, for a screen that shows the chain without loading years of it. */
    List<AuditSeal> findByTenantKeyOrderBySeqDesc(UUID tenantKey, Pageable pageable);

    /**
     * Every chain that has anything in it, so the sealing job knows which municipalities to walk
     * without asking the tenant table — a municipality with no audit entries needs no chain.
     */
    @Query("select distinct s.tenantKey from AuditSeal s")
    List<UUID> findChainKeys();
}
