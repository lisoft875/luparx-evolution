package cr.luparx.geo.repository;

import cr.luparx.geo.entity.IdentityDocumentType;
import cr.luparx.geo.entity.IdentityDocumentTypeId;
import cr.luparx.geo.model.IdentityDocumentTypeCode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface IdentityDocumentTypeRepository
        extends JpaRepository<IdentityDocumentType, IdentityDocumentTypeId> {

    List<IdentityDocumentType> findByCountryCodeAndActiveTrueOrderByTypeAsc(String countryCode);

    Optional<IdentityDocumentType> findByCountryCodeAndType(String countryCode, IdentityDocumentTypeCode type);
}
