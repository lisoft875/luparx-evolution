package cr.luparx.enforcement.entity;

import cr.luparx.core.money.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.util.UUID;

/**
 * One kind of infraction a municipality fines ({@code infraction_types}, V17_0).
 *
 * <p>Configuration, never code. What is fined, how much, whether a photograph is required and how
 * long the citizen has to pay are decisions of each municipality — set by its administrator through
 * {@code PUT /admin/enforcement/infraction-types} — and a platform that hardcoded them would be
 * unusable in the second municipality, let alone the second country.</p>
 *
 * <p>The row is mutable, and the citation is not: {@code Citation} snapshots the code, the name and
 * the amount at the moment it was issued. Raising a fine next year must never change what somebody
 * was fined last year, and a name corrected for a typo must not rewrite an act already served.</p>
 */
@Entity
@Table(name = "infraction_types")
public class InfractionType {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    /** Short municipal code, unique inside the municipality — what the officer and the citizen say. */
    @Column(name = "code", nullable = false, length = 32)
    private String code;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "fine_amount_minor", nullable = false)
    private long fineAmountMinor;

    @Column(name = "currency_code", nullable = false, length = 3)
    private String currencyCode;

    /**
     * Whether a citation of this kind may be emitted without a photograph. True for everything that
     * is contested on appearance ("no visible ticket"); a municipality may set it false for kinds
     * where the officer's word has always sufficed.
     */
    @Column(name = "requires_photo", nullable = false)
    private boolean requiresPhoto;

    @Column(name = "allows_appeal", nullable = false)
    private boolean allowsAppeal;

    /** Days from issue during which paying early costs less; null when the municipality offers none. */
    @Column(name = "discount_days")
    private Integer discountDays;

    /** Percentage taken off while inside {@link #discountDays}. Null when there is no discount. */
    @Column(name = "discount_percent")
    private Integer discountPercent;

    /** Days from issue after which the citation is overdue. */
    @Column(name = "due_days", nullable = false)
    private int dueDays;

    @Column(name = "active", nullable = false)
    private boolean active;

    /** Order the catalogue is offered in; the officer's list is short and its order is theirs. */
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private long version;

    protected InfractionType() {
        // for JPA
    }

    public InfractionType(UUID id, UUID tenantId, String code, String name, String description, Money fine,
                          boolean requiresPhoto, boolean allowsAppeal, Integer discountDays, Integer discountPercent,
                          int dueDays, int sortOrder, Instant now) {
        this.id = id;
        this.tenantId = tenantId;
        this.code = code;
        this.name = name;
        this.description = description;
        this.fineAmountMinor = fine.minorUnits();
        this.currencyCode = fine.currencyCode();
        this.requiresPhoto = requiresPhoto;
        this.allowsAppeal = allowsAppeal;
        this.discountDays = discountDays;
        this.discountPercent = discountPercent;
        this.dueDays = dueDays;
        this.active = true;
        this.sortOrder = sortOrder;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void update(String name, String description, Money fine, boolean requiresPhoto, boolean allowsAppeal,
                       Integer discountDays, Integer discountPercent, int dueDays, boolean active, int sortOrder,
                       Instant now) {
        this.name = name;
        this.description = description;
        this.fineAmountMinor = fine.minorUnits();
        this.currencyCode = fine.currencyCode();
        this.requiresPhoto = requiresPhoto;
        this.allowsAppeal = allowsAppeal;
        this.discountDays = discountDays;
        this.discountPercent = discountPercent;
        this.dueDays = dueDays;
        this.active = active;
        this.sortOrder = sortOrder;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public long getFineAmountMinor() {
        return fineAmountMinor;
    }

    public String getCurrencyCode() {
        return currencyCode;
    }

    public Money getFine() {
        return Money.ofMinor(fineAmountMinor, currencyCode);
    }

    public boolean isRequiresPhoto() {
        return requiresPhoto;
    }

    public boolean isAllowsAppeal() {
        return allowsAppeal;
    }

    public Integer getDiscountDays() {
        return discountDays;
    }

    public Integer getDiscountPercent() {
        return discountPercent;
    }

    public int getDueDays() {
        return dueDays;
    }

    public boolean isActive() {
        return active;
    }

    public int getSortOrder() {
        return sortOrder;
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

    /** True when this kind offers a reduced amount for paying early. */
    public boolean hasDiscount() {
        return discountDays != null && discountDays > 0 && discountPercent != null && discountPercent > 0;
    }

    /**
     * The reduced amount, computed in minor units and rounded <b>down</b> so the citizen is never
     * charged a colón more than the discount promises. Returns the full fine when there is no
     * discount, so callers never have to branch.
     */
    public Money discountedFine() {
        if (!hasDiscount()) {
            return getFine();
        }
        long keep = 100L - discountPercent.longValue();
        return Money.ofMinor(Math.floorDiv(fineAmountMinor * keep, 100L), currencyCode);
    }
}
