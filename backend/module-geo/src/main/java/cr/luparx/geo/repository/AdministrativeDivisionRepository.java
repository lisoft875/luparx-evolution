package cr.luparx.geo.repository;

import cr.luparx.geo.entity.AdministrativeDivision;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Reads of this table are always narrowed: by parent, by level, or both. There is deliberately no
 * "list every division" method — the table grows to millions of rows once several countries are
 * loaded (CONTRACT.md §7: no unbounded scans through normal endpoints).
 */
public interface AdministrativeDivisionRepository extends JpaRepository<AdministrativeDivision, UUID> {

    List<AdministrativeDivision> findByCountryCodeAndParentIdAndActiveTrueOrderByNameAsc(
            String countryCode, UUID parentId, Pageable pageable);

    List<AdministrativeDivision> findByCountryCodeAndLevelAndActiveTrueOrderByNameAsc(
            String countryCode, int level, Pageable pageable);

    List<AdministrativeDivision> findByCountryCodeAndParentIdIsNullAndActiveTrueOrderByNameAsc(
            String countryCode, Pageable pageable);

    /**
     * Resolves an explicit, caller-supplied list of official codes at one level. Bounded by the list
     * itself rather than paginated, which is what makes it safe here: the caller already knows every
     * code it is asking for. Codes are unique within (country, level), so the result holds at most
     * one row per requested code.
     */
    List<AdministrativeDivision> findByCountryCodeAndLevelAndCodeIn(
            String countryCode, int level, Collection<String> codes);
}
