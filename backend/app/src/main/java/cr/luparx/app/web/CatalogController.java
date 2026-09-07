package cr.luparx.app.web;

import cr.luparx.app.web.dto.CatalogDtos;
import cr.luparx.geo.service.AdministrativeDivisionService;
import cr.luparx.geo.service.CountryCatalogService;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

/**
 * Public, cacheable catalogues (CONTRACT.md §4).
 *
 * <p>No authentication is required — a registration form needs them before anybody has an account.
 * Exposure is limited on purpose: only active countries and only publishable (active) municipalities
 * appear, so the endpoint cannot be used to enumerate suspended or unlaunched tenants
 * (SECURITY.md §1).</p>
 */
@RestController
@RequestMapping("/api/v1/catalog")
@Tag(name = "Catalog", description = "Public reference data: countries, administrative divisions, "
        + "document types and publishable municipalities.")
public class CatalogController {

    private static final Duration CACHE_TTL = Duration.ofHours(1);

    private final CountryCatalogService countryCatalogService;
    private final AdministrativeDivisionService divisionService;
    private final TenantService tenantService;
    private final ResponseMapper mapper;

    public CatalogController(CountryCatalogService countryCatalogService,
                             AdministrativeDivisionService divisionService,
                             TenantService tenantService,
                             ResponseMapper mapper) {
        this.countryCatalogService = countryCatalogService;
        this.divisionService = divisionService;
        this.tenantService = tenantService;
        this.mapper = mapper;
    }

    @GetMapping("/countries")
    @Operation(summary = "List active countries with their platform defaults")
    public ResponseEntity<List<CatalogDtos.CountryResponse>> countries() {
        List<CatalogDtos.CountryResponse> body = countryCatalogService.listActiveCountries().stream()
                .map(mapper::toCountry)
                .toList();
        return cacheable(body);
    }

    @GetMapping("/countries/{code}/admin-levels")
    @Operation(summary = "Administrative levels of a country (labels are i18n keys, never literals)")
    public ResponseEntity<List<CatalogDtos.AdminLevelResponse>> adminLevels(@PathVariable String code) {
        List<CatalogDtos.AdminLevelResponse> body = countryCatalogService.adminLevels(code).stream()
                .map(mapper::toAdminLevel)
                .toList();
        return cacheable(body);
    }

    @GetMapping("/countries/{code}/divisions")
    @Operation(summary = "Administrative divisions of a country, narrowed by parent or by level")
    public ResponseEntity<List<CatalogDtos.AdministrativeDivisionResponse>> divisions(
            @PathVariable String code,
            @RequestParam(required = false) UUID parentId,
            @RequestParam(required = false) Integer level) {
        List<CatalogDtos.AdministrativeDivisionResponse> body = divisionService.list(code, parentId, level).stream()
                .map(mapper::toDivision)
                .toList();
        return cacheable(body);
    }

    @GetMapping("/countries/{code}/document-types")
    @Operation(summary = "Identity document types accepted for a country, with pattern and example")
    public ResponseEntity<List<CatalogDtos.DocumentTypeResponse>> documentTypes(@PathVariable String code) {
        List<CatalogDtos.DocumentTypeResponse> body = countryCatalogService.documentTypes(code).stream()
                .map(mapper::toDocumentType)
                .toList();
        return cacheable(body);
    }

    @GetMapping("/tenants")
    @Operation(summary = "Publishable municipalities, optionally filtered by country")
    public ResponseEntity<List<CatalogDtos.TenantCatalogResponse>> tenants(
            @RequestParam(required = false) String country) {
        List<CatalogDtos.TenantCatalogResponse> body = tenantService.listPublishable(country).stream()
                .map(mapper::toTenantCatalog)
                .toList();
        return cacheable(body);
    }

    private <T> ResponseEntity<T> cacheable(T body) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(CACHE_TTL).cachePublic())
                .body(body);
    }
}
