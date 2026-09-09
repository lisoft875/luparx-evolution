package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.CitationEvidence;
import cr.luparx.enforcement.model.EvidenceKind;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Evidence attached to a citation, always narrowed by the municipality that owns the citation. */
public interface CitationEvidenceRepository extends JpaRepository<CitationEvidence, UUID> {

    List<CitationEvidence> findByTenantIdAndCitationIdOrderByCreatedAtAsc(UUID tenantId, UUID citationId);

    Optional<CitationEvidence> findByTenantIdAndCitationIdAndId(UUID tenantId, UUID citationId, UUID id);

    long countByTenantIdAndCitationIdAndKind(UUID tenantId, UUID citationId, EvidenceKind kind);
}
