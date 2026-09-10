package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.ExemptionDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Backing documents of a permit. Narrowed by tenant everywhere, like the evidence of a citation. */
public interface ExemptionDocumentRepository extends JpaRepository<ExemptionDocument, UUID> {

    List<ExemptionDocument> findByTenantIdAndExemptionIdOrderByCreatedAtAsc(UUID tenantId, UUID exemptionId);

    /**
     * One document, narrowed by tenant <em>and</em> by its permit.
     *
     * <p>The storage key is read off this row and never taken from the request, which is what makes a
     * traversal or a cross-tenant read impossible here rather than merely unlikely.</p>
     */
    Optional<ExemptionDocument> findByTenantIdAndExemptionIdAndId(UUID tenantId, UUID exemptionId, UUID id);

    long countByTenantIdAndExemptionId(UUID tenantId, UUID exemptionId);

    /**
     * How many documents each permit of a page carries, in one query.
     *
     * <p>Grouped in the database rather than counted per row: a register screen that asked once per
     * permit would get slower exactly as a municipality grants more of them.</p>
     *
     * @return rows of {@code [exemptionId, count]}
     */
    @Query("""
            select d.exemptionId, count(d) from ExemptionDocument d
            where d.tenantId = :tenantId and d.exemptionId in :ids
            group by d.exemptionId
            """)
    List<Object[]> countByExemption(@Param("tenantId") UUID tenantId, @Param("ids") Collection<UUID> ids);
}
