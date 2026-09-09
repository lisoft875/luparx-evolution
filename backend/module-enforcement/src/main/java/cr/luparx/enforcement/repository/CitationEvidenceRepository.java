package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.CitationEvidence;
import cr.luparx.enforcement.model.EvidenceKind;
import cr.luparx.enforcement.model.EvidenceSource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Evidence attached to a citation, always narrowed by the municipality that owns the citation. */
public interface CitationEvidenceRepository extends JpaRepository<CitationEvidence, UUID> {

    List<CitationEvidence> findByTenantIdAndCitationIdOrderByCreatedAtAsc(UUID tenantId, UUID citationId);

    Optional<CitationEvidence> findByTenantIdAndCitationIdAndId(UUID tenantId, UUID citationId, UUID id);

    List<CitationEvidence> findByTenantIdAndAppealIdOrderByCreatedAtAsc(UUID tenantId, UUID appealId);

    /**
     * Counted by source, always. "Does this citation have a photograph" means the officer's: a
     * photograph the citizen attached to their defence cannot retroactively satisfy the evidence the
     * infraction type demanded, and the citizen's own limit is a different number.
     */
    long countByTenantIdAndCitationIdAndKindAndSource(UUID tenantId, UUID citationId, EvidenceKind kind,
                                                      EvidenceSource source);

    long countByTenantIdAndAppealIdAndKind(UUID tenantId, UUID appealId, EvidenceKind kind);
}
