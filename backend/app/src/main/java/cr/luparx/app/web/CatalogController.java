package cr.luparx.app.web;

import cr.luparx.app.web.dto.CatalogDtos;
import cr.luparx.geo.service.AdministrativeDivisionService;
import cr.luparx.parking.model.VehicleColor;
import cr.luparx.parking.model.VehicleType;
import cr.luparx.geo.service.CountryCatalogService;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.id.TenantId;
import cr.luparx.tenancy.service.TenantLocaleService;
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
import java.util.ArrayList;
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
    private final TenantLocaleService tenantLocaleService;
    private final ResponseMapper mapper;

    public CatalogController(CountryCatalogService countryCatalogService,
                             AdministrativeDivisionService divisionService,
                             TenantService tenantService,
                             TenantLocaleService tenantLocaleService,
                             ResponseMapper mapper) {
        this.countryCatalogService = countryCatalogService;
        this.divisionService = divisionService;
        this.tenantService = tenantService;
        this.tenantLocaleService = tenantLocaleService;
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

    /**
     * The languages a municipality offers (CONTRACT.md v0.3, "Idiomas por municipalidad").
     *
     * <p>Public because the login screen needs it before anybody has a token. A municipality that is
     * not publishable answers exactly as a non-existent one does — the same 404, not a 409 that would
     * confirm the identifier is real — so the endpoint cannot be used to enumerate suspended or
     * unlaunched tenants (SECURITY.md §1). Only enabled languages are listed: a client is told what it
     * may pick, not what an administrator is still preparing.</p>
     */
    @GetMapping("/tenants/{id}/locales")
    @Operation(summary = "Languages a municipality offers, and which of them is its default")
    public ResponseEntity<List<CatalogDtos.TenantLocaleResponse>> tenantLocales(@PathVariable UUID id) {
        TenantId tenantId = TenantId.of(id);
        if (!tenantService.require(tenantId).getStatus().allowsAccess()) {
            throw NotFoundException.of(ErrorCode.TENANT_NOT_FOUND, "error.tenant.notFound");
        }
        List<CatalogDtos.TenantLocaleResponse> body = tenantLocaleService.listEnabled(tenantId).stream()
                .map(mapper::toTenantLocale)
                .toList();
        return cacheable(body);
    }

    /**
     * The kinds of vehicle a citizen may register, with a translation key each.
     *
     * <p>Published rather than written into the frontend because four applications have to agree on
     * this list, and because it stops being cosmetic the day a municipality charges a motorcycle
     * differently from a car. Public and cacheable: it is the same list for everybody and it changes
     * when the platform is deployed, not when a request is made.</p>
     */
    @GetMapping("/vehicle-types")
    @Operation(summary = "Kinds of vehicle a citizen may register, with their i18n label keys")
    public ResponseEntity<List<CatalogDtos.CatalogEntryResponse>> vehicleTypes() {
        List<CatalogDtos.CatalogEntryResponse> body = new ArrayList<>(VehicleType.values().length);
        for (VehicleType type : VehicleType.values()) {
            body.add(new CatalogDtos.CatalogEntryResponse(type.name(), type.labelKey()));
        }
        return cacheable(body);
    }

    /**
     * The colours a vehicle may be, with a translation key each.
     *
     * <p>A closed list because the inspector's search is "the grey one", and free text would make
     * that match five spellings of the same colour.</p>
     */
    @GetMapping("/vehicle-colors")
    @Operation(summary = "Colours a vehicle may be, with their i18n label keys")
    public ResponseEntity<List<CatalogDtos.CatalogEntryResponse>> vehicleColors() {
        List<CatalogDtos.CatalogEntryResponse> body = new ArrayList<>(VehicleColor.values().length);
        for (VehicleColor color : VehicleColor.values()) {
            body.add(new CatalogDtos.CatalogEntryResponse(color.name(), color.labelKey()));
        }
        return cacheable(body);
    }

    private <T> ResponseEntity<T> cacheable(T body) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(CACHE_TTL).cachePublic())
                .body(body);
    }
}
