package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.CitationAppeal;
import cr.luparx.enforcement.model.AppealStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** Defences of one municipality. Tenant first on every read, like everything else in this module. */
public interface CitationAppealRepository extends JpaRepository<CitationAppeal, UUID> {

    Optional<CitationAppeal> findByTenantIdAndCitationId(UUID tenantId, UUID citationId);

    Optional<CitationAppeal> findByTenantIdAndId(UUID tenantId, UUID id);

    /** The municipality's queue: what is waiting to be decided, oldest first. */
    Page<CitationAppeal> findByTenantIdAndStatusOrderBySubmittedAtAsc(UUID tenantId, AppealStatus status,
                                                                     Pageable pageable);

    Page<CitationAppeal> findByTenantIdOrderBySubmittedAtDesc(UUID tenantId, Pageable pageable);
}
