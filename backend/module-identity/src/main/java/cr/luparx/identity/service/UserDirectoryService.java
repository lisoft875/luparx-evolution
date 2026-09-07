package cr.luparx.identity.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.i18n.CountryCodes;
import cr.luparx.core.i18n.Locales;
import cr.luparx.core.i18n.TimeZones;
import cr.luparx.core.id.UserId;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.page.SortDirection;
import cr.luparx.geo.model.AddressInput;
import cr.luparx.geo.model.NormalizedPhone;
import cr.luparx.geo.service.AddressValidator;
import cr.luparx.geo.service.PhoneNumberService;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.model.UserStatus;
import cr.luparx.identity.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Read and administrative write operations on users.
 *
 * <p>The tenant-scoped listing takes the set of user ids that hold a membership in the active tenant
 * as a parameter: there is no code path from an admin-portal request to an unfiltered user query
 * (docs/ARCHITECTURE.md §4). The global padrón is a separate, explicitly named method that only the
 * platform back-office may call.</p>
 */
@Service
public class UserDirectoryService {

    private static final List<String> SORTABLE_FIELDS =
            List.of("createdAt", "email", "familyName", "givenName", "status");

    private final UserRepository userRepository;
    private final PhoneNumberService phoneNumberService;
    private final AddressValidator addressValidator;
    private final RefreshTokenService refreshTokenService;
    private final Clock clock;

    public UserDirectoryService(UserRepository userRepository,
                                PhoneNumberService phoneNumberService,
                                AddressValidator addressValidator,
                                RefreshTokenService refreshTokenService,
                                Clock clock) {
        this.userRepository = userRepository;
        this.phoneNumberService = phoneNumberService;
        this.addressValidator = addressValidator;
        this.refreshTokenService = refreshTokenService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public User require(UserId userId) {
        return userRepository.findById(userId.value())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.USER_NOT_FOUND, "error.user.notFound"));
    }

    /** Tenant-scoped listing. {@code ids} must already be restricted to the active tenant. */
    @Transactional(readOnly = true)
    public PageResponse<User> searchWithin(Collection<UUID> ids, String query, UserStatus status,
                                           PageRequest request) {
        if (ids == null || ids.isEmpty()) {
            return PageResponse.empty(request);
        }
        Page<User> page = userRepository.searchByIds(ids, likeTerm(query), status, toPageable(request));
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    /** Platform-wide padrón; callable only from {@code /api/v1/platform/**}. */
    @Transactional(readOnly = true)
    public PageResponse<User> searchGlobal(String query, UserStatus status, String countryCode,
                                           PageRequest request) {
        String country = CountryCodes.normalize(countryCode);
        Page<User> page = userRepository.searchGlobal(likeTerm(query), status,
                CountryCodes.isValid(country) ? country : null, toPageable(request));
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    @Transactional
    public User block(UserId userId, String reason) {
        User user = require(userId);
        user.block(reason, clock.instant());
        // Blocking must take effect now, not when the current access token happens to expire.
        refreshTokenService.revokeAllForUser(userId);
        return user;
    }

    @Transactional
    public User unblock(UserId userId) {
        User user = require(userId);
        user.unblock(clock.instant());
        return user;
    }

    @Transactional
    public User setMfaRequired(UserId userId, boolean required) {
        User user = require(userId);
        user.requireMfa(required, clock.instant());
        return user;
    }

    /**
     * Updates the editable part of a profile (CONTRACT.md §4 {@code PUT /{portal}/me}).
     *
     * <p>The identity document is deliberately not editable through this path: changing it would
     * break the uniqueness invariant and is a support operation with its own audit trail.</p>
     */
    @Transactional
    public User updateProfile(UserId userId, String givenName, String familyName, String secondFamilyName,
                              String phoneCountryCode, String phoneNationalNumber, AddressInput address,
                              String nationalityCode, String locale, String timeZone) {
        User user = require(userId);
        Instant now = clock.instant();

        if (givenName != null && familyName != null) {
            user.updateName(givenName.trim(), familyName.trim(),
                    secondFamilyName == null || secondFamilyName.isBlank() ? null : secondFamilyName.trim(), now);
        }
        if (phoneNationalNumber != null) {
            NormalizedPhone phone = phoneNumberService.validateAndNormalize(
                    phoneCountryCode == null ? user.getPhoneCountryCode() : phoneCountryCode,
                    phoneNationalNumber, "phone.nationalNumber");
            user.updateContact(phone.e164(), phone.countryCode(), now);
        }
        if (address != null) {
            addressValidator.validate(address);
            user.updateAddress(address.countryCode(), address.level1Id(), address.level2Id(), address.level3Id(),
                    address.line1(), address.line2(), address.postalCode(), now);
        }
        String nationality = CountryCodes.normalize(nationalityCode);
        if (CountryCodes.isValid(nationality)) {
            user.updateNationality(nationality, now);
        }
        user.updatePreferences(
                Locales.parse(locale).map(java.util.Locale::toLanguageTag).orElse(user.getLocale()),
                TimeZones.parse(timeZone).map(java.time.ZoneId::getId).orElse(user.getTimeZone()),
                now);
        return user;
    }

    private String likeTerm(String query) {
        if (query == null || query.isBlank()) {
            return null;
        }
        return "%" + query.trim().toLowerCase(Locale.ROOT) + "%";
    }

    private Pageable toPageable(PageRequest request) {
        String field = request.sortField();
        if (field == null || !SORTABLE_FIELDS.contains(field)) {
            field = "createdAt";
        }
        Sort sort = Sort.by(request.direction() == SortDirection.DESC
                ? Sort.Order.desc(field)
                : Sort.Order.asc(field));
        return org.springframework.data.domain.PageRequest.of(request.page(), request.size(), sort);
    }
}
