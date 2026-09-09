package cr.luparx.identity.service;

import cr.luparx.core.email.EmailAddress;
import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.CountryCodes;
import cr.luparx.core.i18n.Locales;
import cr.luparx.core.i18n.TimeZones;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.geo.model.AddressInput;
import cr.luparx.geo.model.NormalizedDocument;
import cr.luparx.geo.model.NormalizedPhone;
import cr.luparx.geo.service.AddressValidator;
import cr.luparx.geo.service.CountryCatalogService;
import cr.luparx.geo.service.IdentityDocumentValidator;
import cr.luparx.geo.service.PhoneNumberService;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.entity.UserCredentials;
import cr.luparx.identity.model.UserStatus;
import cr.luparx.identity.repository.UserCredentialsRepository;
import cr.luparx.identity.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneOffset;
import java.util.regex.Pattern;

/**
 * Applies CONTRACT.md §2 in order: name, identity document, address, phone, nationality, email,
 * birth date, then the account fields.
 *
 * <p>Everything is validated server-side (CONTRACT.md §7). Uniqueness is checked here for a clear
 * error message, and enforced again by the database constraints — the check-then-insert race is
 * closed by the unique indexes, not by this code.</p>
 */
@Service
public class UserRegistrationService {

    /** Deliberately permissive: RFC 5321 addresses are far more varied than the usual strict regex. */
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s.]+(\\.[^@\\s.]+)+$");
    private static final int MAX_NAME_LENGTH = 100;

    private final UserRepository userRepository;
    private final UserCredentialsRepository credentialsRepository;
    private final IdentityDocumentValidator documentValidator;
    private final AddressValidator addressValidator;
    private final PhoneNumberService phoneNumberService;
    private final CountryCatalogService countryCatalogService;
    private final PasswordService passwordService;
    private final EmailVerificationService emailVerificationService;
    private final RegistrationPolicy policy;
    private final Clock clock;

    public UserRegistrationService(UserRepository userRepository,
                                   UserCredentialsRepository credentialsRepository,
                                   IdentityDocumentValidator documentValidator,
                                   AddressValidator addressValidator,
                                   PhoneNumberService phoneNumberService,
                                   CountryCatalogService countryCatalogService,
                                   PasswordService passwordService,
                                   EmailVerificationService emailVerificationService,
                                   RegistrationPolicy policy,
                                   Clock clock) {
        this.userRepository = userRepository;
        this.credentialsRepository = credentialsRepository;
        this.documentValidator = documentValidator;
        this.addressValidator = addressValidator;
        this.phoneNumberService = phoneNumberService;
        this.countryCatalogService = countryCatalogService;
        this.passwordService = passwordService;
        this.emailVerificationService = emailVerificationService;
        this.policy = policy;
        this.clock = clock;
    }

    /**
     * Somebody opening their own account. Refused on any portal but the citizen's (CONTRACT.md
     * v0.13), and the password is theirs and mandatory.
     */
    @Transactional
    public RegistrationResult register(RegistrationCommand command) {
        if (!command.portal().selfRegistrationAllowed()) {
            throw ForbiddenException.of(ErrorCode.SELF_REGISTRATION_DISABLED, "error.registration.portal.disabled");
        }
        return create(command, true);
    }

    /**
     * An account opened <em>for</em> somebody by an operator — a municipal administrator hiring an
     * inspector, or the platform back-office (CONTRACT.md v0.14).
     *
     * <p>Same validation, same uniqueness, same record: the difference is who typed it and what
     * happens to the password. The operator never sets one. {@code command.password()} is null, no
     * credentials row is written, and the account cannot be signed into until the person follows the
     * link they are emailed and chooses their own. An operator who could set the password could sign
     * in as that person and issue fines in their name.</p>
     *
     * <p>The portal gate above does not apply here, and that is the whole point: these are exactly
     * the portals that no longer self-register. What replaces it is the caller's authority — the
     * controller checks the permission and that the role is one a municipal administrator may
     * grant.</p>
     */
    @Transactional
    public RegistrationResult createByOperator(RegistrationCommand command) {
        return create(command, false);
    }

    private RegistrationResult create(RegistrationCommand command, boolean selfService) {
        Instant now = clock.instant();
        ValidationException.Collector errors = new ValidationException.Collector();

        // 1. full name
        String givenName = trimmed(command.givenName());
        String familyName = trimmed(command.familyName());
        String secondFamilyName = trimmed(command.secondFamilyName());
        if (isBlankOrTooLong(givenName)) {
            errors.add("givenName", ErrorCode.VALIDATION_FAILED, "error.user.givenName.required");
        }
        if (isBlankOrTooLong(familyName)) {
            errors.add("familyName", ErrorCode.VALIDATION_FAILED, "error.user.familyName.required");
        }
        if (secondFamilyName != null && secondFamilyName.length() > MAX_NAME_LENGTH) {
            errors.add("secondFamilyName", ErrorCode.VALIDATION_FAILED, "error.user.secondFamilyName.tooLong");
        }

        // 6. email (validated early: the uniqueness check is the most common failure).
        // Normalised here as well as at the DTO boundary: a caller reaching this service directly
        // must not be able to create a second account that differs only by case or by a stray space.
        String email = EmailAddress.normalize(command.email());
        if (email == null || !EMAIL_PATTERN.matcher(email).matches() || email.length() > 320) {
            errors.add("email", ErrorCode.VALIDATION_FAILED, "error.user.email.invalid");
        }

        // 7. birth date
        LocalDate birthDate = command.birthDate();
        if (birthDate == null) {
            errors.add("birthDate", ErrorCode.INVALID_BIRTH_DATE, "error.user.birthDate.required");
        } else {
            LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
            if (birthDate.isAfter(today)) {
                errors.add("birthDate", ErrorCode.INVALID_BIRTH_DATE, "error.user.birthDate.future");
            } else if (Period.between(birthDate, today).getYears() < policy.minimumAge()) {
                errors.add("birthDate", ErrorCode.MINIMUM_AGE_NOT_MET, "error.user.birthDate.minimumAge");
            }
        }

        // 5. nationality
        String nationality = CountryCodes.normalize(command.nationalityCode());
        if (!CountryCodes.isValid(nationality)) {
            errors.add("nationalityCode", ErrorCode.COUNTRY_NOT_FOUND, "error.user.nationality.invalid");
        }

        errors.throwIfAny();

        // The catalogue lookups below throw on their own with precise field paths.
        countryCatalogService.requireActiveCountry(nationality);

        // 2. identity document
        NormalizedDocument document = documentValidator.validateAndNormalize(
                command.documentCountryCode(), command.documentType(), command.documentNumber(),
                "identityDocument.number");

        // 3. address
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

        // 4. phone
        NormalizedPhone phone = phoneNumberService.validateAndNormalize(
                command.phoneCountryCode(), command.phoneNationalNumber(), "phone.nationalNumber");

        // account fields. An operator-created account arrives with no password at all; anything
        // else that is sent is still held to the policy.
        boolean withPassword = selfService || command.password() != null;
        if (withPassword) {
            passwordService.validatePolicy(command.password(), "password");
        }
        String locale = Locales.parse(command.locale()).map(java.util.Locale::toLanguageTag)
                .orElse(policy.defaultLocale());
        String timeZone = TimeZones.parse(command.timeZone()).map(java.time.ZoneId::getId)
                .orElse(policy.defaultTimeZone());
        String termsVersion = command.acceptedTermsVersion() == null || command.acceptedTermsVersion().isBlank()
                ? policy.currentTermsVersion()
                : command.acceptedTermsVersion().trim();

        // Uniqueness: friendly errors here, hard guarantees in the database.
        if (userRepository.existsByEmail(email)) {
            throw ConflictException.of(ErrorCode.EMAIL_ALREADY_REGISTERED, "error.user.email.taken");
        }
        if (userRepository.existsByDocumentCountryCodeAndDocumentTypeAndDocumentNumberNormalized(
                document.countryCode(), document.type(), document.normalized())) {
            throw ConflictException.of(ErrorCode.DOCUMENT_ALREADY_REGISTERED, "error.user.document.taken");
        }

        User user = new User(
                Uuid7.generate(),
                email,
                givenName,
                familyName,
                secondFamilyName,
                document.countryCode(),
                document.type(),
                document.raw(),
                document.normalized(),
                address.countryCode(),
                address.level1Id(),
                address.level2Id(),
                address.level3Id(),
                address.line1(),
                address.line2(),
                address.postalCode(),
                phone.e164(),
                phone.countryCode(),
                nationality,
                birthDate,
                locale,
                timeZone,
                UserStatus.PENDING_VERIFICATION,
                termsVersion,
                now);
        userRepository.save(user);

        if (withPassword) {
            credentialsRepository.save(new UserCredentials(
                    user.getId(),
                    passwordService.hash(command.password()),
                    passwordService.algorithm(),
                    now,
                    false));
        }

        String verificationToken = emailVerificationService.issueToken(UserId.of(user.getId()));

        return new RegistrationResult(UserId.of(user.getId()), user.getStatus(), true, verificationToken);
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
