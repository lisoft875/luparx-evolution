package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.CitationEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * The history of a citation. Read in one call with the citation itself: a defence reads the act and
 * what happened to it together, and two round trips is how those two get out of step on a screen.
 * Bounded by nature — a citation accumulates a handful of events in its life, not a stream.
 */
public interface CitationEventRepository extends JpaRepository<CitationEvent, UUID> {

    List<CitationEvent> findByTenantIdAndCitationIdOrderByOccurredAtAsc(UUID tenantId, UUID citationId);
}
