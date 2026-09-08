package cr.luparx.identity.service;

import cr.luparx.geo.model.IdentityDocumentTypeCode;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Everything a person may change about themselves through {@code PUT /api/v1/{portal}/me}
 * (CONTRACT.md v0.3, "Perfil editable"): the whole of §2 except the email address, which is an
 * identity of access and has its own confirmed flow ({@link EmailChangeService}).
 *
 * <p>The fields are in the order §2 fixes, so this record, the DTO and the form read alike.</p>
 *
 * <p><b>Null means "leave it as it is".</b> Not "clear it": the profile is edited from several
 * screens and a client that sends only the section it owns must not wipe the rest. A section that
 * <em>is</em> sent is validated in full, with exactly the rules registration applies — a document
 * still has to match its country's pattern and check digit, an address still has to name every
 * administrative level the country defines, a phone still has to be a real number for its country,
 * and a birth date still has to clear the minimum age.</p>
 *
 * @param givenName          first name; sent together with {@code familyName} or not at all
 * @param familyName         first family name
 * @param secondFamilyName   optional second family name (many locales have none)
 * @param documentCountryCode issuing country of the identity document
 * @param documentType       document type, as the country's catalogue declares it
 * @param documentNumber     document number, as typed
 * @param addressCountryCode country of the address
 * @param addressLevel1Id    first administrative level (for Costa Rica, the province)
 * @param addressLevel2Id    second administrative level (canton)
 * @param addressLevel3Id    third administrative level (district)
 * @param addressLine1       street address
 * @param addressLine2       optional second address line
 * @param addressPostalCode  optional postal code
 * @param phoneCountryCode   country of the phone number
 * @param phoneNationalNumber national part of the phone number
 * @param nationalityCode    ISO 3166-1 alpha-2 nationality
 * @param birthDate          date of birth
 * @param locale             preferred BCP 47 language tag
 * @param timeZone           preferred IANA time zone
 */
public record ProfileUpdateCommand(
        String givenName,
        String familyName,
        String secondFamilyName,
        String documentCountryCode,
        IdentityDocumentTypeCode documentType,
        String documentNumber,
        String addressCountryCode,
        UUID addressLevel1Id,
        UUID addressLevel2Id,
        UUID addressLevel3Id,
        String addressLine1,
        String addressLine2,
        String addressPostalCode,
        String phoneCountryCode,
        String phoneNationalNumber,
        String nationalityCode,
        LocalDate birthDate,
        String locale,
        String timeZone) {

    /** True when the caller sent an identity document at all. */
    public boolean hasIdentityDocument() {
        return documentType != null && documentNumber != null && !documentNumber.isBlank();
    }

    /** True when the caller sent an address at all. */
    public boolean hasAddress() {
        return addressCountryCode != null && !addressCountryCode.isBlank();
    }
}
