package cr.luparx.parking.entity;

import cr.luparx.core.id.UserId;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * A vehicle a citizen registered ({@code vehicles}, V11_0).
 *
 * <p><b>There is no tenant here, and that is the point.</b> A person is global on this platform
 * (CONTRACT.md §1) and the same car is driven to two municipalities on the same day; what is per
 * tenant is the session, the money and the minutes. The vehicle belongs to the person.</p>
 *
 * <p>Uniqueness is {@code (user_id, plate_normalized)}. Two different people registering the same
 * plate is legitimate — a shared family car, a company car, a plate reused after a transfer — so a
 * global unique index must never be added here.</p>
 */
@Entity
@Table(name = "vehicles")
public class Vehicle {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /** As the citizen typed it, so the app can show it back the way they wrote it. */
    @Column(name = "plate", nullable = false, length = 16)
    private String plate;

    /** Upper case, no separators. What is compared and indexed. */
    @Column(name = "plate_normalized", nullable = false, length = 16)
    private String plateNormalized;

    /** The nickname the owner gives the car. Optional, like everything except the plate. */
    @Column(name = "name", length = 80)
    private String name;

    @Column(name = "brand", length = 80)
    private String brand;

    @Column(name = "model", length = 80)
    private String model;

    @Column(name = "year")
    private Integer year;

    /** A declaration by the citizen, never a verified fact: no vehicle registry is consulted. */
    @Column(name = "is_owner", nullable = false)
    private boolean owner = true;

    @Column(name = "is_primary", nullable = false)
    private boolean primary;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected Vehicle() {
        // for JPA
    }

    public Vehicle(UUID id, UUID userId, String plate, String plateNormalized, String name, String brand,
                   String model, Integer year, boolean owner, boolean primary, Instant createdAt) {
        this.id = id;
        this.userId = userId;
        this.plate = plate;
        this.plateNormalized = plateNormalized;
        this.name = name;
        this.brand = brand;
        this.model = model;
        this.year = year;
        this.owner = owner;
        this.primary = primary;
        this.createdAt = createdAt;
        this.updatedAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UserId user() {
        return UserId.of(userId);
    }

    public String getPlate() {
        return plate;
    }

    public String getPlateNormalized() {
        return plateNormalized;
    }

    public String getName() {
        return name;
    }

    public String getBrand() {
        return brand;
    }

    public String getModel() {
        return model;
    }

    public Integer getYear() {
        return year;
    }

    public boolean isOwner() {
        return owner;
    }

    public boolean isPrimary() {
        return primary;
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
     * Changes the plate together with its normalised form: the two are one value and are never set
     * independently, or a lookup would stop finding a car its owner can still see.
     */
    public void changePlate(String plate, String plateNormalized) {
        this.plate = plate;
        this.plateNormalized = plateNormalized;
    }

    public void describe(String name, String brand, String model, Integer year, boolean owner) {
        this.name = name;
        this.brand = brand;
        this.model = model;
        this.year = year;
        this.owner = owner;
    }

    /** At most one per user; the partial unique index in V11_0 is what enforces it. */
    public void changePrimary(boolean primary) {
        this.primary = primary;
    }

    public void touch(Instant now) {
        this.updatedAt = now;
    }
}
