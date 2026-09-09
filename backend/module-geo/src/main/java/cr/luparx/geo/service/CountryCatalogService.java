package cr.luparx.geo.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.i18n.CountryCodes;
import cr.luparx.geo.entity.Country;
import cr.luparx.geo.entity.CountryAdminLevel;
import cr.luparx.geo.entity.IdentityDocumentType;
import cr.luparx.geo.repository.CountryAdminLevelRepository;
import cr.luparx.geo.repository.CountryRepository;
import cr.luparx.geo.repository.IdentityDocumentTypeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Read model behind the public catalogue endpoints (CONTRACT.md §4). The data is global and
 * cacheable; it carries no tenant scope, so its cache partition is deliberately separate from any
 * tenant-keyed cache (docs/ARCHITECTURE.md §4).
 */
@Service
@Transactional(readOnly = true)
public class CountryCatalogService {

    private final CountryRepository countryRepository;
    private final CountryAdminLevelRepository adminLevelRepository;
    private final IdentityDocumentTypeRepository documentTypeRepository;

    public CountryCatalogService(CountryRepository countryRepository,
                                 CountryAdminLevelRepository adminLevelRepository,
                                 IdentityDocumentTypeRepository documentTypeRepository) {
        this.countryRepository = countryRepository;
        this.adminLevelRepository = adminLevelRepository;
        this.documentTypeRepository = documentTypeRepository;
    }

    public List<Country> listActiveCountries() {
        return countryRepository.findByActiveTrueOrderByCodeAsc();
    }

    public Country requireActiveCountry(String code) {
        String normalized = CountryCodes.normalize(code);
        Country country = countryRepository.findById(normalized == null ? "" : normalized)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.COUNTRY_NOT_FOUND, "error.country.notFound", code));
        if (!country.isActive()) {
            throw NotFoundException.of(ErrorCode.COUNTRY_NOT_ACTIVE, "error.country.notActive", code);
        }
        return country;
    }

    public List<CountryAdminLevel> adminLevels(String countryCode) {
        Country country = requireActiveCountry(countryCode);
        return adminLevelRepository.findByCountryCodeOrderByLevelAsc(country.getCode());
    }

    public List<IdentityDocumentType> documentTypes(String countryCode) {
        Country country = requireActiveCountry(countryCode);
        // Ordered by the presentation order the country configured, so a client only has to render
        // what arrives — the rule "in Costa Rica, the national id first" is data, not client code.
        return documentTypeRepository.findByCountryCodeAndActiveTrueOrderBySortOrderAscTypeAsc(country.getCode());
    }
}
