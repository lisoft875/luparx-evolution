package cr.luparx.identity.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.CountryCodes;
import cr.luparx.core.i18n.Locales;
import cr.luparx.core.i18n.TimeZones;
import cr.luparx.core.id.UserId;
import cr.luparx.geo.model.AddressInput;
import cr.luparx.geo.model.NormalizedDocument;
import cr.luparx.geo.model.NormalizedPhone;
import cr.luparx.geo.service.AddressValidator;
import cr.luparx.geo.service.CountryCatalogService;
import cr.luparx.geo.service.IdentityDocumentValidator;
import cr.luparx.geo.service.PhoneNumberService;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneOffset;
import java.util.Optional;

/**
 * The editable part of one's own profile (CONTRACT.md v0.3, "Perfil editable").
 *
 * <p>It exists next to {@link UserRegistrationService} rather than inside it because registering and
 * editing are different use cases, and next to {@link UserDirectoryService} rather than inside it
 * because that class is the administrative directory. What it does <em>not</em> do is invent a second
 * set of rules: every field is put through the same validator registration uses — the document
 * through {@link IdentityDocumentValidator}, the address through {@link AddressValidator}, the phone
 * through {@link PhoneNumberService}, the minimum age through the configured
 * {@link RegistrationPolicy}. A profile a person edits must not be able to hold a value the same
 * person could not have registered with.</p>
 *
 * <p>The email address is deliberately absent: changing it is changing the identity of access, and
 * it goes through {@link EmailChangeService}, confirmed from the new mailbox.</p>
 */
@Service
public class UserProfileService {

    private static final int MAX_NAME_LENGTH = 100;

    private final UserRepository userRepository;
    private final IdentityDocumentValidator documentValidator;
    private final AddressValidator addressValidator;
    private final PhoneNumberService phoneNumberService;
    private final CountryCatalogService countryCatalogService;
    private final RegistrationPolicy policy;
    private final Clock clock;

    public UserProfileService(UserRepository userRepository,
                              IdentityDocumentValidator documentValidator,
                              AddressValidator addressValidator,
                              PhoneNumberService phoneNumberService,
                              CountryCatalogService countryCatalogService,
                              RegistrationPolicy policy,
                              Clock clock) {
        this.userRepository = userRepository;
        this.documentValidator = documentValidator;
        this.addressValidator = addressValidator;
        this.phoneNumberService = phoneNumberService;
        this.countryCatalogService = countryCatalogService;
        this.policy = policy;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public User require(UserId userId) {
        return userRepository.findById(userId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));
    }

    /**
     * Applies an edit. Structural problems are collected and reported together, in the order of §2,
     * so a form shows every mistake at once instead of one per round trip.
     *
     * @throws ConflictException {@code DOCUMENT_ALREADY_REGISTERED} when the document now belongs to
     *         somebody else. The unique index is what guarantees it; this check is what makes the
     *         message readable.
     */
    @Transactional
    public User update(UserId userId, ProfileUpdateCommand command) {
        User user = require(userId);
        Instant now = clock.instant();
        ValidationException.Collector errors = new ValidationException.Collector();

        // 1. full name — sent as a pair or not at all; half a name is a client bug, not an edit.
        String givenName = trimmed(command.givenName());
        String familyName = trimmed(command.familyName());
        String secondFamilyName = trimmed(command.secondFamilyName());
        boolean nameSent = givenName != null || familyName != null;
        if (nameSent) {
            if (isBlankOrTooLong(givenName)) {
                errors.add("givenName", ErrorCode.VALIDATION_FAILED, "error.user.givenName.required");
            }
            if (isBlankOrTooLong(familyName)) {
                errors.add("familyName", ErrorCode.VALIDATION_FAILED, "error.user.familyName.required");
            }
            if (secondFamilyName != null && secondFamilyName.length() > MAX_NAME_LENGTH) {
                errors.add("secondFamilyName", ErrorCode.VALIDATION_FAILED, "error.user.secondFamilyName.tooLong");
            }
        }

        // 7. birth date — the minimum age is the deployment's, never a constant here.
        LocalDate birthDate = command.birthDate();
        if (birthDate != null) {
            LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
            if (birthDate.isAfter(today)) {
                errors.add("birthDate", ErrorCode.INVALID_BIRTH_DATE, "error.user.birthDate.future");
            } else if (Period.between(birthDate, today).getYears() < policy.minimumAge()) {
                errors.add("birthDate", ErrorCode.MINIMUM_AGE_NOT_MET, "error.user.birthDate.minimumAge");
            }
        }

        // 5. nationality
        String nationality = CountryCodes.normalize(command.nationalityCode());
        if (command.nationalityCode() != null && !CountryCodes.isValid(nationality)) {
            errors.add("nationalityCode", ErrorCode.COUNTRY_NOT_FOUND, "error.user.nationality.invalid");
        }

        errors.throwIfAny();

        // The catalogue and format checks below throw on their own, each with its own field path.
        if (nationality != null && CountryCodes.isValid(nationality)) {
            countryCatalogService.requireActiveCountry(nationality);
            user.updateNationality(nationality, now);
        }

        // 2. identity document
        if (command.hasIdentityDocument()) {
            NormalizedDocument document = documentValidator.validateAndNormalize(
                    command.documentCountryCode() == null ? user.getDocumentCountryCode()
                            : command.documentCountryCode(),
                    command.documentType(),
                    command.documentNumber(),
                    "identityDocument.number");
            Optional<User> holder = userRepository
                    .findByDocumentCountryCodeAndDocumentTypeAndDocumentNumberNormalized(
                            document.countryCode(), document.type(), document.normalized());
            if (holder.isPresent() && !holder.get().getId().equals(user.getId())) {
                throw ConflictException.of(ErrorCode.DOCUMENT_ALREADY_REGISTERED, "error.user.document.taken");
            }
            user.updateIdentityDocument(document.countryCode(), document.type(), document.raw(),
                    document.normalized(), now);
        }

        // 3. address
        if (command.hasAddress()) {
            AddressInput address = new AddressInput(
                    CountryCodes.normalize(command.addressCountryCode()),
                    command.addressLevel1Id(),
                    command.addressLevel2Id(),
                    command.addressLevel3Id(),
                    trimmed(command.addressLine1()),
                    trimmed(command.addressLine2()),
                    trimmed(command.addressPostalCode()));
            countryCatalogService.requireActiveCountry(address.countryCode());
            addressValidator.validate(address);
            user.updateAddress(address.countryCode(), address.level1Id(), address.level2Id(), address.level3Id(),
                    address.line1(), address.line2(), address.postalCode(), now);
        }

        // 4. phone
        if (command.phoneNationalNumber() != null && !command.phoneNationalNumber().isBlank()) {
            NormalizedPhone phone = phoneNumberService.validateAndNormalize(
                    command.phoneCountryCode() == null ? user.getPhoneCountryCode() : command.phoneCountryCode(),
                    command.phoneNationalNumber(),
                    "phone.nationalNumber");
            user.updateContact(phone.e164(), phone.countryCode(), now);
        }

        if (nameSent) {
            user.updateName(givenName, familyName, secondFamilyName, now);
        }
        if (birthDate != null) {
            user.updateBirthDate(birthDate, now);
        }
        // Preferences fall back to what the user already had, so sending neither keeps both.
        user.updatePreferences(
                Locales.parse(command.locale()).map(java.util.Locale::toLanguageTag).orElse(user.getLocale()),
                TimeZones.parse(command.timeZone()).map(java.time.ZoneId::getId).orElse(user.getTimeZone()),
                now);
        return user;
    }

    private static String trimmed(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static boolean isBlankOrTooLong(String value) {
        return value == null || value.isBlank() || value.length() > MAX_NAME_LENGTH;
    }
}
