package cr.luparx.geo.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.geo.entity.AdministrativeDivision;
import cr.luparx.geo.repository.AdministrativeDivisionRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Level-by-level navigation of the administrative tree, backing
 * {@code GET /catalog/countries/{code}/divisions?parentId=&level=}.
 *
 * <p>The contract returns a plain array here (the client renders a select box), so the query is
 * always narrowed by parent or by level and the result is hard-capped: an unfiltered read of this
 * table is never allowed through an application endpoint (CONTRACT.md §7).</p>
 */
@Service
@Transactional(readOnly = true)
public class AdministrativeDivisionService {

    /** Upper bound on a single catalogue response; the largest real level-2 set is far below this. */
    public static final int MAX_RESULTS = 500;

    private final AdministrativeDivisionRepository divisionRepository;
    private final CountryCatalogService countryCatalogService;

    public AdministrativeDivisionService(AdministrativeDivisionRepository divisionRepository,
                                         CountryCatalogService countryCatalogService) {
        this.divisionRepository = divisionRepository;
        this.countryCatalogService = countryCatalogService;
    }

    /**
     * @param parentId children of this division, or null for the top level
     * @param level    explicit level filter; used when the caller wants every division of a level
     */
    public List<AdministrativeDivision> list(String countryCode, UUID parentId, Integer level) {
        String country = countryCatalogService.requireActiveCountry(countryCode).getCode();
        Pageable limit = PageRequest.ofSize(MAX_RESULTS);
        if (parentId != null) {
            return divisionRepository
                    .findByCountryCodeAndParentIdAndActiveTrueOrderByNameAsc(country, parentId, limit);
        }
        if (level != null) {
            return divisionRepository
                    .findByCountryCodeAndLevelAndActiveTrueOrderByNameAsc(country, level, limit);
        }
        return divisionRepository.findByCountryCodeAndParentIdIsNullAndActiveTrueOrderByNameAsc(country, limit);
    }

    public AdministrativeDivision require(UUID id) {
        return divisionRepository.findById(id)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.DIVISION_NOT_FOUND, "error.division.notFound", id));
    }
}
