package cr.luparx.app.outbox;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface OutboxEventRepository extends JpaRepository<OutboxEventEntity, UUID> {

    /** The publication queue: unpublished rows in insertion order, always bounded by a page size. */
    List<OutboxEventEntity> findByPublishedAtIsNullOrderByCreatedAtAsc(Pageable pageable);

    /**
     * What the relay takes on this pass: one type, still pending, not given up on, and due.
     *
     * <p>Narrowed by {@code type} on purpose. The table has carried parking and identity events since
     * V1_0 with nobody consuming them, and a relay that swept everything would treat those years-old
     * rows as a backlog to deliver. A consumer claims its own type; the rest keep waiting for theirs.</p>
     */
    @Query("""
            select e from OutboxEventEntity e
            where e.type = :type and e.publishedAt is null and e.failedAt is null and e.nextAttemptAt <= :now
            order by e.nextAttemptAt asc
            """)
    List<OutboxEventEntity> findDue(@Param("type") String type, @Param("now") Instant now, Pageable pageable);
}
