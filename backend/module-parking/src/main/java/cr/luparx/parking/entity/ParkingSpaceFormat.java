package cr.luparx.parking.entity;

import cr.luparx.core.id.TenantId;
import cr.luparx.parking.model.ParkingSpaceFormatDefaults;
import cr.luparx.parking.model.SpaceCodeFormat;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * The shape of a bay code in one municipality ({@code parking_space_formats}, V12_0 — CONTRACT.md
 * v0.3, "Formato del código de espacio"). One row per tenant, the tenant being the primary key.
 *
 * <p>{@link #getPattern()} is the only thing the server validates against. {@code prefix},
 * {@code digits} and {@code allowLetters} are the parts an administrator edits, from which the
 * pattern is derived when they do not write one themselves; {@code example} is the placeholder the
 * app shows, and it is verified against its own pattern before the row is written.</p>
 */
@Entity
@Table(name = "parking_space_formats")
public class ParkingSpaceFormat {

    @Id
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "prefix", nullable = false, length = 8)
    private String prefix;

    @Column(name = "digits", nullable = false)
    private int digits;

    @Column(name = "allow_letters", nullable = false)
    private boolean allowLetters;

    @Column(name = "pattern", nullable = false, length = 200)
    private String pattern;

    @Column(name = "example", nullable = false, length = 32)
    private String example;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ParkingSpaceFormat() {
        // for JPA
    }

    public ParkingSpaceFormat(UUID tenantId, String prefix, int digits, boolean allowLetters, String pattern,
                              String example, Instant createdAt) {
        this.tenantId = tenantId;
        this.prefix = prefix;
        this.digits = digits;
        this.allowLetters = allowLetters;
        this.pattern = pattern;
        this.example = example;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }

    /** The row a municipality starts with, built from the deployment's configured defaults. */
    public static ParkingSpaceFormat fromDefaults(TenantId tenantId, ParkingSpaceFormatDefaults defaults,
                                                  Instant now) {
        return new ParkingSpaceFormat(tenantId.value(), defaults.prefix(), defaults.digits(),
                defaults.allowLetters(), defaults.pattern(), defaults.example(), now);
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public TenantId tenant() {
        return TenantId.of(tenantId);
    }

    public String getPrefix() {
        return prefix;
    }

    public int getDigits() {
        return digits;
    }

    public boolean isAllowLetters() {
        return allowLetters;
    }

    public String getPattern() {
        return pattern;
    }

    public String getExample() {
        return example;
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

    /**
     * Whether a code, already normalised with {@link SpaceCodeFormat#normalize}, is one this
     * municipality could have painted.
     *
     * <p>A pattern that no longer compiles — written by hand and since made invalid — accepts
     * nothing rather than everything. Refusing a code a citizen typed is recoverable; accepting any
     * string as a bay identifier is not.</p>
     */
    public boolean accepts(String normalizedCode) {
        if (normalizedCode == null || normalizedCode.isEmpty()
                || normalizedCode.length() > SpaceCodeFormat.MAX_CODE_LENGTH) {
            return false;
        }
        Optional<Pattern> compiled = SpaceCodeFormat.compile(pattern);
        return compiled.isPresent() && compiled.get().matcher(normalizedCode).matches();
    }

    public void replace(String prefix, int digits, boolean allowLetters, String pattern, String example,
                        Instant now) {
        this.prefix = prefix;
        this.digits = digits;
        this.allowLetters = allowLetters;
        this.pattern = pattern;
        this.example = example;
        this.updatedAt = now;
    }
}
