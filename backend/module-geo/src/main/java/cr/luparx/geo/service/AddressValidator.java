package cr.luparx.geo.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.CountryCodes;
import cr.luparx.geo.entity.AdministrativeDivision;
import cr.luparx.geo.entity.CountryAdminLevel;
import cr.luparx.geo.model.AddressInput;
import cr.luparx.geo.repository.AdministrativeDivisionRepository;
import cr.luparx.geo.repository.CountryAdminLevelRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Verifies that the chain of administrative divisions in an address is internally consistent: each
 * division exists, is active, belongs to the declared country, sits at the expected level and hangs
 * off the division of the previous level.
 *
 * <p>Without this check a client could submit a canton of one province together with a district of
 * another, or a division belonging to a different country entirely.</p>
 */
@Service
public class AddressValidator {

    private final AdministrativeDivisionRepository divisionRepository;
    private final CountryAdminLevelRepository adminLevelRepository;

    public AddressValidator(AdministrativeDivisionRepository divisionRepository,
                            CountryAdminLevelRepository adminLevelRepository) {
        this.divisionRepository = divisionRepository;
        this.adminLevelRepository = adminLevelRepository;
    }

    /** @throws ValidationException listing every offending field at once */
    public void validate(AddressInput address) {
        ValidationException.Collector errors = new ValidationException.Collector();

        if (address == null) {
            throw new ValidationException("address", ErrorCode.INVALID_ADDRESS, "error.address.required");
        }
        String country = CountryCodes.normalize(address.countryCode());
        if (!CountryCodes.isValid(country)) {
            throw new ValidationException("address.countryCode", ErrorCode.COUNTRY_NOT_FOUND,
                    "error.address.country.invalid");
        }
        if (address.line1() == null || address.line1().isBlank()) {
            errors.add("address.line1", ErrorCode.INVALID_ADDRESS, "error.address.line1.required");
        }

        List<CountryAdminLevel> levels = adminLevelRepository.findByCountryCodeOrderByLevelAsc(country);
        List<UUID> submitted = new ArrayList<>();
        submitted.add(address.level1Id());
        submitted.add(address.level2Id());
        submitted.add(address.level3Id());

        UUID expectedParent = null;
        for (int index = 0; index < submitted.size(); index++) {
            int level = index + 1;
            String field = "address.level" + level + "Id";
            UUID divisionId = submitted.get(index);
            Optional<CountryAdminLevel> configured = levels.stream()
                    .filter(candidate -> candidate.getLevel() != null && candidate.getLevel() == level)
                    .findFirst();

            if (divisionId == null) {
                if (configured.isPresent() && configured.get().isRequired()) {
                    errors.add(field, ErrorCode.INVALID_ADDRESS, "error.address.level.required");
                }
                // A missing level ends the chain: deeper levels cannot be validated without it.
                break;
            }
            if (configured.isEmpty()) {
                errors.add(field, ErrorCode.INVALID_ADDRESS, "error.address.level.notDefined");
                break;
            }

            Optional<AdministrativeDivision> division = divisionRepository.findById(divisionId);
            if (division.isEmpty() || !division.get().isActive()) {
                errors.add(field, ErrorCode.DIVISION_NOT_FOUND, "error.address.division.notFound");
                break;
            }
            AdministrativeDivision found = division.get();
            if (!country.equals(found.getCountryCode())) {
                errors.add(field, ErrorCode.INVALID_ADDRESS, "error.address.division.wrongCountry");
                break;
            }
            if (found.getLevel() != level) {
                errors.add(field, ErrorCode.INVALID_ADDRESS, "error.address.division.wrongLevel");
                break;
            }
            if (level == 1) {
                if (found.getParentId() != null) {
                    errors.add(field, ErrorCode.INVALID_ADDRESS, "error.address.division.wrongParent");
                    break;
                }
            } else if (!java.util.Objects.equals(expectedParent, found.getParentId())) {
                errors.add(field, ErrorCode.INVALID_ADDRESS, "error.address.division.wrongParent");
                break;
            }
            expectedParent = found.getId();
        }

        errors.throwIfAny();
    }
}
