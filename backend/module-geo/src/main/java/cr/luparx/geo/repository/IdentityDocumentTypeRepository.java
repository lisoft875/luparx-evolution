package cr.luparx.geo.repository;

import cr.luparx.geo.entity.IdentityDocumentType;
import cr.luparx.geo.entity.IdentityDocumentTypeId;
import cr.luparx.geo.model.IdentityDocumentTypeCode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface IdentityDocumentTypeRepository
        extends JpaRepository<IdentityDocumentType, IdentityDocumentTypeId> {

    /**
     * The types a country accepts, in the order the form must draw them (V20_0): {@code sort_order}
     * first, the type name only as a tie-break so the result is deterministic. Alphabetical order was
     * what put "OTHER" second and the national id fourth.
     */
    List<IdentityDocumentType> findByCountryCodeAndActiveTrueOrderBySortOrderAscTypeAsc(String countryCode);

    /** The country's current default, if it has one. Used to clear it before setting another. */
    Optional<IdentityDocumentType> findByCountryCodeAndDefaultTypeTrue(String countryCode);

    Optional<IdentityDocumentType> findByCountryCodeAndType(String countryCode, IdentityDocumentTypeCode type);
}
