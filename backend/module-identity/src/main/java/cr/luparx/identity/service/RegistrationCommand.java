package cr.luparx.identity.service;

import cr.luparx.core.domain.Portal;
import cr.luparx.geo.model.IdentityDocumentTypeCode;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Registration input, in the exact field order of CONTRACT.md §2 so that the DTO, this command, the
 * entity and the UI form all read the same way.
 *
 * <p>Flattened rather than nested because this is the boundary between the API layer and the domain:
 * nesting is a wire concern, and flattening keeps the validation errors' field paths explicit.</p>
 */
public record RegistrationCommand(
        // 1. full name
        String givenName,
        String familyName,
        String secondFamilyName,
        // 2. identity document
        String documentCountryCode,
        IdentityDocumentTypeCode documentType,
        String documentNumber,
        // 3. address
        String addressCountryCode,
        UUID addressLevel1Id,
        UUID addressLevel2Id,
        UUID addressLevel3Id,
        String addressLine1,
        String addressLine2,
        String addressPostalCode,
        // 4. phone
        String phoneCountryCode,
        String phoneNationalNumber,
        // 5. nationality
        String nationalityCode,
        // 6. email
        String email,
        // 7. birth date
        LocalDate birthDate,
        // account fields
        String password,
        String locale,
        String timeZone,
        String acceptedTermsVersion,
        UUID tenantId,
        Portal portal) {
}
