package cr.luparx.parking.entity;

import cr.luparx.core.money.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * Tariff of a zone over a validity window ({@code parking_rates}, V5_0).
 *
 * <p>Money is integer minor units plus an ISO 4217 code (ADR 0009): the pair is exposed as
 * {@link Money} and is never converted to a floating-point type. The currency travels with the
 * amount because a platform serving several countries has several currencies at once.</p>
 */
@Entity
@Table(name = "parking_rates")
public class ParkingRate {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "zone_id", nullable = false)
    private UUID zoneId;

    @Column(name = "amount_minor", nullable = false)
    private long amountMinor;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    /** Length of the charged block in minutes; strictly positive (CHECK in V5_0). */
    @Column(name = "minutes", nullable = false)
    private int minutes;

    @Column(name = "valid_from", nullable = false)
    private Instant validFrom;

    /** Null means "still in force"; a closed window ends strictly after it started. */
    @Column(name = "valid_to")
    private Instant validTo;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected ParkingRate() {
        // for JPA
    }

    public ParkingRate(UUID id, UUID tenantId, UUID zoneId, Money amount, int minutes, Instant validFrom,
                       Instant validTo, Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.zoneId = zoneId;
        this.amountMinor = amount.minorUnits();
        this.currencyCode = amount.currencyCode();
        this.minutes = minutes;
        this.validFrom = validFrom;
        this.validTo = validTo;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getZoneId() {
        return zoneId;
    }

    public long getAmountMinor() {
        return amountMinor;
    }

    public String getCurrencyCode() {
        return currencyCode;
    }

    public Money getAmount() {
        return Money.ofMinor(amountMinor, currencyCode);
    }

    public int getMinutes() {
        return minutes;
    }

    public Instant getValidFrom() {
        return validFrom;
    }

    public Instant getValidTo() {
        return validTo;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public long getVersion() {
        return version;
    }

    /** Closing a window is how a tariff is superseded; a rate row is never edited in place. */
    public void close(Instant validTo) {
        this.validTo = validTo;
    }
}
