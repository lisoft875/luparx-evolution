package cr.luparx.identity.entity;

import cr.luparx.core.id.UserId;
import cr.luparx.geo.model.IdentityDocumentTypeCode;
import cr.luparx.identity.model.UserStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * A person (CONTRACT.md §5 {@code users}). Identity is global: one row per human, whatever number of
 * municipalities they belong to. Tenant scoping lives in {@code tenant_memberships}.
 *
 * <p>Field order follows the registration order of CONTRACT.md §2 so that the entity, the DTO and the
 * UI stay readable side by side. The document number is stored twice on purpose: as typed (for
 * display) and normalised (for the uniqueness constraint).</p>
 */
@Entity
@Table(name = "users")
public class User {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    /** Stored in a citext column: unique and compared case-insensitively. */
    @Column(name = "email", nullable = false, length = 320)
    private String email;

    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;

    // --- §2.1 full name --------------------------------------------------------------------------
    @Column(name = "given_name", nullable = false, length = 100)
    private String givenName;

    @Column(name = "family_name", nullable = false, length = 100)
    private String familyName;

    /** Optional: many locales use a single family name (CONTRACT.md §2 item 1). */
    @Column(name = "second_family_name", length = 100)
    private String secondFamilyName;

    // --- §2.2 identity document -----------------------------------------------------------------
    @Column(name = "document_country_code", nullable = false, length = 2)
    private String documentCountryCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "document_type", nullable = false, length = 32)
    private IdentityDocumentTypeCode documentType;

    @Column(name = "document_number", nullable = false, length = 64)
    private String documentNumber;

    @Column(name = "document_number_normalized", nullable = false, length = 64)
    private String documentNumberNormalized;

    // --- §2.3 address ----------------------------------------------------------------------------
    @Column(name = "address_country_code", nullable = false, length = 2)
    private String addressCountryCode;

    @Column(name = "address_level1_id")
    private UUID addressLevel1Id;

    @Column(name = "address_level2_id")
    private UUID addressLevel2Id;

    @Column(name = "address_level3_id")
    private UUID addressLevel3Id;

    @Column(name = "address_line1", nullable = false, length = 200)
    private String addressLine1;

    @Column(name = "address_line2", length = 200)
    private String addressLine2;

    @Column(name = "address_postal_code", length = 32)
    private String addressPostalCode;

    // --- §2.4 phone ------------------------------------------------------------------------------
    @Column(name = "phone_e164", nullable = false, length = 20)
    private String phoneE164;

    @Column(name = "phone_country_code", nullable = false, length = 2)
    private String phoneCountryCode;

    // --- §2.5 nationality ------------------------------------------------------------------------
    @Column(name = "nationality_code", nullable = false, length = 2)
    private String nationalityCode;

    // --- §2.7 birth date -------------------------------------------------------------------------
    @Column(name = "birth_date", nullable = false)
    private LocalDate birthDate;

    // --- account ---------------------------------------------------------------------------------
    @Column(name = "locale", nullable = false, length = 35)
    private String locale;

    @Column(name = "time_zone", nullable = false, length = 64)
    private String timeZone;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private UserStatus status;

    @Column(name = "blocked_reason", length = 500)
    private String blockedReason;


    @Column(name = "accepted_terms_version", nullable = false, length = 32)
    private String acceptedTermsVersion;

    /**
     * Bumped on every password change, forced reset or block. Access tokens carry it as {@code ver};
     * a token minted before the bump is rejected immediately instead of living out its 15 minutes
     * (SECURITY.md §2).
     */
    @Column(name = "credentials_version", nullable = false)
    private int credentialsVersion;

    /**
     * When this account was last signed into, and through which portal (CONTRACT.md v0.15).
     *
     * <p>On the person and not on the membership because that is what the act knows: you sign in to
     * a portal, and the municipality is chosen afterwards. It answers the first question of any
     * access review — is this account still being used — and the portal beside it keeps an inspector
     * who works every day from reading like somebody who only ever opens the citizen app.</p>
     */
    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @Column(name = "last_login_portal", length = 16)
    private String lastLoginPortal;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected User() {
        // for JPA
    }

    public User(UUID id, String email, String givenName, String familyName, String secondFamilyName,
                String documentCountryCode, IdentityDocumentTypeCode documentType, String documentNumber,
                String documentNumberNormalized, String addressCountryCode, UUID addressLevel1Id,
                UUID addressLevel2Id, UUID addressLevel3Id, String addressLine1, String addressLine2,
                String addressPostalCode, String phoneE164, String phoneCountryCode, String nationalityCode,
                LocalDate birthDate, String locale, String timeZone, UserStatus status,
                String acceptedTermsVersion, Instant createdAt) {
        this.id = id;
        this.email = email;
        this.givenName = givenName;
        this.familyName = familyName;
        this.secondFamilyName = secondFamilyName;
        this.documentCountryCode = documentCountryCode;
        this.documentType = documentType;
        this.documentNumber = documentNumber;
        this.documentNumberNormalized = documentNumberNormalized;
        this.addressCountryCode = addressCountryCode;
        this.addressLevel1Id = addressLevel1Id;
        this.addressLevel2Id = addressLevel2Id;
        this.addressLevel3Id = addressLevel3Id;
        this.addressLine1 = addressLine1;
        this.addressLine2 = addressLine2;
        this.addressPostalCode = addressPostalCode;
        this.phoneE164 = phoneE164;
        this.phoneCountryCode = phoneCountryCode;
        this.nationalityCode = nationalityCode;
        this.birthDate = birthDate;
        this.locale = locale;
        this.timeZone = timeZone;
        this.status = status;
        this.acceptedTermsVersion = acceptedTermsVersion;
        this.credentialsVersion = 1;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UserId userId() {
        return UserId.of(id);
    }

    public String getEmail() {
        return email;
    }

    public Instant getEmailVerifiedAt() {
        return emailVerifiedAt;
    }

    public boolean isEmailVerified() {
        return emailVerifiedAt != null;
    }

    public String getGivenName() {
        return givenName;
    }

    public String getFamilyName() {
        return familyName;
    }

    public String getSecondFamilyName() {
        return secondFamilyName;
    }

    public String getDocumentCountryCode() {
        return documentCountryCode;
    }

    public IdentityDocumentTypeCode getDocumentType() {
        return documentType;
    }

    public String getDocumentNumber() {
        return documentNumber;
    }

    public String getDocumentNumberNormalized() {
        return documentNumberNormalized;
    }

    public String getAddressCountryCode() {
        return addressCountryCode;
    }

    public UUID getAddressLevel1Id() {
        return addressLevel1Id;
    }

    public UUID getAddressLevel2Id() {
        return addressLevel2Id;
    }

    public UUID getAddressLevel3Id() {
        return addressLevel3Id;
    }

    public String getAddressLine1() {
        return addressLine1;
    }

    public String getAddressLine2() {
        return addressLine2;
    }

    public String getAddressPostalCode() {
        return addressPostalCode;
    }

    public String getPhoneE164() {
        return phoneE164;
    }

    public String getPhoneCountryCode() {
        return phoneCountryCode;
    }

    public String getNationalityCode() {
        return nationalityCode;
    }

    public LocalDate getBirthDate() {
        return birthDate;
    }

    public String getLocale() {
        return locale;
    }

    public String getTimeZone() {
        return timeZone;
    }

    public UserStatus getStatus() {
        return status;
    }

    public String getBlockedReason() {
        return blockedReason;
    }


    public String getAcceptedTermsVersion() {
        return acceptedTermsVersion;
    }

    public int getCredentialsVersion() {
        return credentialsVersion;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public long getVersion() {
        return version;
    }

    // --- behaviour -------------------------------------------------------------------------------

    /**
     * The person's name as one string.
     *
     * <p>On the entity because two very different callers need the same answer: the API, which
     * renders it, and the enforcement flow, which <em>copies</em> it onto a citation and must copy
     * exactly what the API would have shown. The order of the parts is Costa Rican convention and a
     * locale concern the client may still re-order for display; what must not vary is which parts
     * are in it.</p>
     */
    public String displayName() {
        StringBuilder builder = new StringBuilder(givenName).append(' ').append(familyName);
        if (secondFamilyName != null && !secondFamilyName.isBlank()) {
            builder.append(' ').append(secondFamilyName);
        }
        return builder.toString();
    }

    /** Recorded on every successful sign-in, whichever portal it was. */
    public void recordLogin(String portalSlug, Instant now) {
        this.lastLoginAt = now;
        this.lastLoginPortal = portalSlug;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public String getLastLoginPortal() {
        return lastLoginPortal;
    }

    public void markEmailVerified(Instant now) {
        this.emailVerifiedAt = now;
        if (this.status == UserStatus.PENDING_VERIFICATION) {
            this.status = UserStatus.ACTIVE;
        }
        this.updatedAt = now;
    }

    public void block(String reason, Instant now) {
        this.status = UserStatus.BLOCKED;
        this.blockedReason = reason;
        this.credentialsVersion++;
        this.updatedAt = now;
    }

    public void unblock(Instant now) {
        this.status = isEmailVerified() ? UserStatus.ACTIVE : UserStatus.PENDING_VERIFICATION;
        this.blockedReason = null;
        this.updatedAt = now;
    }


    /** Invalidates every token issued so far (password change, forced reset, admin action). */
    public void bumpCredentialsVersion(Instant now) {
        this.credentialsVersion++;
        this.updatedAt = now;
    }

    public void updateName(String givenName, String familyName, String secondFamilyName, Instant now) {
        this.givenName = givenName;
        this.familyName = familyName;
        this.secondFamilyName = secondFamilyName;
        this.updatedAt = now;
    }

    public void updateContact(String phoneE164, String phoneCountryCode, Instant now) {
        this.phoneE164 = phoneE164;
        this.phoneCountryCode = phoneCountryCode;
        this.updatedAt = now;
    }

    public void updateAddress(String countryCode, UUID level1Id, UUID level2Id, UUID level3Id, String line1,
                              String line2, String postalCode, Instant now) {
        this.addressCountryCode = countryCode;
        this.addressLevel1Id = level1Id;
        this.addressLevel2Id = level2Id;
        this.addressLevel3Id = level3Id;
        this.addressLine1 = line1;
        this.addressLine2 = line2;
        this.addressPostalCode = postalCode;
        this.updatedAt = now;
    }

    public void updatePreferences(String locale, String timeZone, Instant now) {
        this.locale = locale;
        this.timeZone = timeZone;
        this.updatedAt = now;
    }

    public void updateNationality(String nationalityCode, Instant now) {
        this.nationalityCode = nationalityCode;
        this.updatedAt = now;
    }

    public void updateBirthDate(LocalDate birthDate, Instant now) {
        this.birthDate = birthDate;
        this.updatedAt = now;
    }

    /**
     * Replaces the identity document. The caller has already validated and normalised it and has
     * checked that no other person holds the same one; the unique index is what actually guarantees
     * it (CONTRACT.md §2 item 2).
     */
    public void updateIdentityDocument(String countryCode, IdentityDocumentTypeCode type, String number,
                                       String numberNormalized, Instant now) {
        this.documentCountryCode = countryCode;
        this.documentType = type;
        this.documentNumber = number;
        this.documentNumberNormalized = numberNormalized;
        this.updatedAt = now;
    }

    /**
     * Moves the account to a new address, which is verified by construction: the only way to get
     * here is a token that was read in that mailbox (CONTRACT.md v0.3, "Perfil editable"). The
     * credentials version is bumped by the caller so that every token minted for the old identity
     * stops being accepted.
     */
    public void changeEmail(String email, Instant now) {
        this.email = email;
        this.emailVerifiedAt = now;
        if (this.status == UserStatus.PENDING_VERIFICATION) {
            this.status = UserStatus.ACTIVE;
        }
        this.updatedAt = now;
    }
}
