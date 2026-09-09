package cr.luparx.enforcement.repository;

import cr.luparx.enforcement.entity.AppealNotice;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Versions of the legal notice.
 *
 * <p>Reads are "the newest version already in force", never "the newest row": a municipality writes
 * next month's wording today, and until its {@code effective_from} arrives the citizen must keep
 * seeing — and accepting — the one that is actually current.</p>
 */
public interface AppealNoticeRepository extends JpaRepository<AppealNotice, UUID> {

    @Query("""
            select n from AppealNotice n
            where n.tenantId = :tenantId and n.locale = :locale and n.effectiveFrom <= :now
            order by n.version desc
            """)
    List<AppealNotice> currentForTenant(@Param("tenantId") UUID tenantId, @Param("locale") String locale,
                                        @Param("now") Instant now, Pageable pageable);

    @Query("""
            select n from AppealNotice n
            where n.countryCode = :countryCode and n.locale = :locale and n.effectiveFrom <= :now
            order by n.version desc
            """)
    List<AppealNotice> currentForCountry(@Param("countryCode") String countryCode, @Param("locale") String locale,
                                         @Param("now") Instant now, Pageable pageable);

    List<AppealNotice> findByTenantIdAndLocaleOrderByVersionDesc(UUID tenantId, String locale);

    @Query("select coalesce(max(n.version), 0) from AppealNotice n where n.tenantId = :tenantId and n.locale = :locale")
    int highestTenantVersion(@Param("tenantId") UUID tenantId, @Param("locale") String locale);
}
