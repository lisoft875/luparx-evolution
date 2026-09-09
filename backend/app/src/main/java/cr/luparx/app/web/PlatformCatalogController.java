package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.CatalogDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.i18n.CountryCodes;
import cr.luparx.core.id.Uuid7;
import cr.luparx.geo.entity.AdministrativeDivision;
import cr.luparx.geo.entity.Country;
import cr.luparx.geo.entity.CountryAdminLevel;
import cr.luparx.geo.entity.IdentityDocumentType;
import cr.luparx.geo.model.IdentityDocumentTypeCode;
import cr.luparx.geo.repository.AdministrativeDivisionRepository;
import cr.luparx.geo.repository.CountryAdminLevelRepository;
import cr.luparx.geo.repository.CountryRepository;
import cr.luparx.geo.repository.IdentityDocumentTypeRepository;
import cr.luparx.geo.service.CountryCatalogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Catalogue maintenance from the back-office (CONTRACT.md §4
 * {@code GET/POST/PUT /api/v1/platform/catalog/**}).
 *
 * <p>Adding a country, a division level or a document rule is a data change made through this API —
 * never a code change and never a direct database edit (CONTRACT.md §0). Every write is audited.</p>
 */
@RestController
@RequestMapping("/api/v1/platform/catalog")
@Tag(name = "Platform · Catalog", description = "Maintain countries, administrative divisions and "
        + "identity document rules.")
public class PlatformCatalogController {

    private final CountryRepository countryRepository;
    private final CountryAdminLevelRepository adminLevelRepository;
    private final AdministrativeDivisionRepository divisionRepository;
    private final IdentityDocumentTypeRepository documentTypeRepository;
    private final CountryCatalogService catalogService;
    private final AuditRecorder auditRecorder;
    private final ResponseMapper mapper;

    public PlatformCatalogController(CountryRepository countryRepository,
                                     CountryAdminLevelRepository adminLevelRepository,
                                     AdministrativeDivisionRepository divisionRepository,
                                     IdentityDocumentTypeRepository documentTypeRepository,
                                     CountryCatalogService catalogService,
                                     AuditRecorder auditRecorder,
                                     ResponseMapper mapper) {
        this.countryRepository = countryRepository;
        this.adminLevelRepository = adminLevelRepository;
        this.divisionRepository = divisionRepository;
        this.documentTypeRepository = documentTypeRepository;
        this.catalogService = catalogService;
        this.auditRecorder = auditRecorder;
        this.mapper = mapper;
    }

    // --- countries -------------------------------------------------------------------------------

    public record CountryUpsertRequest(
            @NotBlank @Size(min = 2, max = 2) String code,
            @NotBlank @Size(max = 128) String nameKey,
            @NotBlank @Size(max = 8) String dialCode,
            @NotBlank @Size(max = 35) String defaultLocale,
            @NotBlank @Size(min = 3, max = 3) String defaultCurrency,
            @NotBlank @Size(max = 64) String defaultTimeZone,
            @NotBlank @Size(max = 32) String displayNameFormat,
            boolean active) {
    }

    @GetMapping("/countries")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Every country in the catalogue, including inactive ones")
    public List<CatalogDtos.CountryResponse> countries() {
        return countryRepository.findAll().stream().map(mapper::toCountry).toList();
    }

    @PostMapping("/countries")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Add a country to the catalogue")
    @Transactional
    public CatalogDtos.CountryResponse createCountry(@Valid @RequestBody CountryUpsertRequest request) {
        String code = CountryCodes.normalize(request.code());
        if (!CountryCodes.isValid(code)) {
            throw new cr.luparx.core.error.ValidationException("code", ErrorCode.COUNTRY_NOT_FOUND,
                    "error.country.invalid");
        }
        Country country = new Country(code, request.nameKey(), request.dialCode(), request.defaultLocale(),
                request.defaultCurrency(), request.defaultTimeZone(), request.displayNameFormat(),
                request.active());
        countryRepository.save(country);
        auditRecorder.record(AuditAction.CATALOG_UPDATED, "country", code, Map.of("operation", "create"));
        return mapper.toCountry(country);
    }

    @PutMapping("/countries/{code}")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Update a country's defaults or deactivate it")
    @Transactional
    public CatalogDtos.CountryResponse updateCountry(@PathVariable String code,
                                                     @Valid @RequestBody CountryUpsertRequest request) {
        String normalized = CountryCodes.normalize(code);
        Country country = countryRepository.findById(normalized == null ? "" : normalized)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.COUNTRY_NOT_FOUND, "error.country.notFound", code));
        country.setNameKey(request.nameKey());
        country.setDialCode(request.dialCode());
        country.setDefaultLocale(request.defaultLocale());
        country.setDefaultCurrency(request.defaultCurrency());
        country.setDefaultTimeZone(request.defaultTimeZone());
        country.setDisplayNameFormat(request.displayNameFormat());
        country.setActive(request.active());
        auditRecorder.record(AuditAction.CATALOG_UPDATED, "country", normalized, Map.of("operation", "update"));
        return mapper.toCountry(country);
    }

    // --- administrative levels and divisions ------------------------------------------------------

    public record AdminLevelUpsertRequest(
            @NotNull Integer level,
            @NotBlank @Size(max = 128) String labelKey,
            boolean required) {
    }

    @PutMapping("/countries/{code}/admin-levels")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Define or update one administrative level of a country")
    @Transactional
    public CatalogDtos.AdminLevelResponse upsertAdminLevel(@PathVariable String code,
                                                           @Valid @RequestBody AdminLevelUpsertRequest request) {
        Country country = catalogService.requireActiveCountry(code);
        CountryAdminLevel level = adminLevelRepository
                .findById(new cr.luparx.geo.entity.CountryAdminLevelId(country.getCode(), request.level()))
                .orElseGet(() -> adminLevelRepository.save(new CountryAdminLevel(country.getCode(),
                        request.level(), request.labelKey(), request.required())));
        level.setLabelKey(request.labelKey());
        level.setRequired(request.required());
        auditRecorder.record(AuditAction.CATALOG_UPDATED, "countryAdminLevel",
                country.getCode() + ":" + request.level(), Map.of("operation", "upsert"));
        return mapper.toAdminLevel(level);
    }

    public record DivisionUpsertRequest(
            UUID parentId,
            @NotNull Integer level,
            @NotBlank @Size(max = 32) String code,
            @NotBlank @Size(max = 160) String name,
            boolean active) {
    }

    @PostMapping("/countries/{code}/divisions")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Add an administrative division")
    @Transactional
    public CatalogDtos.AdministrativeDivisionResponse createDivision(
            @PathVariable String code, @Valid @RequestBody DivisionUpsertRequest request) {
        Country country = catalogService.requireActiveCountry(code);
        AdministrativeDivision division = new AdministrativeDivision(Uuid7.generate(), country.getCode(),
                request.parentId(), request.level(), request.code(), request.name(), request.active());
        divisionRepository.save(division);
        auditRecorder.record(AuditAction.CATALOG_UPDATED, "administrativeDivision",
                division.getId().toString(), Map.of("operation", "create", "country", country.getCode()));
        return mapper.toDivision(division);
    }

    @PutMapping("/divisions/{id}")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Rename or deactivate an administrative division")
    @Transactional
    public CatalogDtos.AdministrativeDivisionResponse updateDivision(
            @PathVariable UUID id, @Valid @RequestBody DivisionUpsertRequest request) {
        AdministrativeDivision division = divisionRepository.findById(id)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.DIVISION_NOT_FOUND, "error.division.notFound", id));
        division.setName(request.name());
        division.setActive(request.active());
        auditRecorder.record(AuditAction.CATALOG_UPDATED, "administrativeDivision", id.toString(),
                Map.of("operation", "update"));
        return mapper.toDivision(division);
    }

    // --- identity document types -------------------------------------------------------------------

    /**
     * {@code sortOrder} and {@code isDefault} arrive as objects rather than primitives so that
     * "leave it as it is" and "set it to zero / to false" are different requests: a caller correcting
     * a regex must not silently reset the country's presentation order.
     */
    public record DocumentTypeUpsertRequest(
            @NotNull IdentityDocumentTypeCode type,
            @NotBlank @Size(max = 128) String labelKey,
            @NotBlank @Size(max = 256) String pattern,
            @NotBlank @Size(max = 32) String normalizer,
            @NotBlank @Size(max = 64) String example,
            boolean active,
            @Min(0) @Max(1000) Integer sortOrder,
            Boolean isDefault) {
    }

    @PutMapping("/countries/{code}/document-types")
    @PreAuthorize("hasAuthority('PERM_PLATFORM_MANAGE')")
    @Operation(summary = "Define or update the rules of one document type for a country")
    @Transactional
    public CatalogDtos.DocumentTypeResponse upsertDocumentType(
            @PathVariable String code, @Valid @RequestBody DocumentTypeUpsertRequest request) {
        Country country = catalogService.requireActiveCountry(code);
        IdentityDocumentType documentType = documentTypeRepository
                .findByCountryCodeAndType(country.getCode(), request.type())
                .orElseGet(() -> documentTypeRepository.save(new IdentityDocumentType(country.getCode(),
                        request.type(), request.labelKey(), request.pattern(), request.normalizer(),
                        request.example(), request.active())));
        documentType.setLabelKey(request.labelKey());
        documentType.setPattern(request.pattern());
        documentType.setNormalizer(request.normalizer());
        documentType.setExample(request.example());
        documentType.setActive(request.active());
        if (request.sortOrder() != null) {
            documentType.setSortOrder(request.sortOrder().intValue());
        }
        if (request.isDefault() != null) {
            applyDefault(country.getCode(), documentType, request.isDefault().booleanValue());
        }
        auditRecorder.record(AuditAction.CATALOG_UPDATED, "identityDocumentType",
                country.getCode() + ":" + request.type(), Map.of("operation", "upsert",
                        "isDefault", String.valueOf(documentType.isDefaultType()),
                        "sortOrder", String.valueOf(documentType.getSortOrder())));
        return mapper.toDocumentType(documentType);
    }

    /**
     * Moves the country's default onto this row, clearing the previous one first.
     *
     * <p>The database allows at most one default per country, so setting a second without clearing
     * the first would simply fail. Doing it here, inside the same transaction, means an administrator
     * changing which document is preselected performs one action rather than two that can be
     * interrupted halfway and leave a country with none.</p>
     *
     * <p>A row cannot be both inactive and the default: preselecting a type the form does not offer
     * would open every registration on an option nobody can choose.</p>
     */
    private void applyDefault(String countryCode, IdentityDocumentType documentType, boolean makeDefault) {
        if (!makeDefault) {
            documentType.setDefaultType(false);
            return;
        }
        if (!documentType.isActive()) {
            throw new ValidationException("isDefault", ErrorCode.VALIDATION_FAILED,
                    "error.document.default.inactive");
        }
        documentTypeRepository.findByCountryCodeAndDefaultTypeTrue(countryCode)
                .filter(current -> !current.getType().equals(documentType.getType()))
                .ifPresent(current -> {
                    current.setDefaultType(false);
                    documentTypeRepository.saveAndFlush(current);
                });
        documentType.setDefaultType(true);
    }
}
