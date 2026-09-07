package cr.luparx.geo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * A node of the generic N-level administrative tree of a country (CONTRACT.md §5
 * {@code administrative_divisions}). The same table models provinces/cantons/districts, states/
 * counties/cities or any other national subdivision; the labels come from
 * {@link CountryAdminLevel}.
 *
 * <p>The parent is referenced by raw id rather than by a JPA association: the tree is read level by
 * level from the catalogue endpoints, and an association would invite accidental eager traversal of
 * a very large table.</p>
 */
@Entity
@Table(name = "administrative_divisions")
public class AdministrativeDivision {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "country_code", nullable = false, length = 2)
    private String countryCode;

    /** Null for level 1. */
    @Column(name = "parent_id")
    private UUID parentId;

    @Column(name = "level", nullable = false)
    private int level;

    /** Official code of the division, unique within (country, level). */
    @Column(name = "code", nullable = false, length = 32)
    private String code;

    /**
     * Proper noun of the division. Unlike labels, a place name is not translated: it is stored as
     * the country's official spelling.
     */
    @Column(name = "name", nullable = false, length = 160)
    private String name;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    protected AdministrativeDivision() {
        // for JPA
    }

    public AdministrativeDivision(UUID id, String countryCode, UUID parentId, int level, String code, String name,
                                  boolean active) {
        this.id = id;
        this.countryCode = countryCode;
        this.parentId = parentId;
        this.level = level;
        this.code = code;
        this.name = name;
        this.active = active;
    }

    public UUID getId() {
        return id;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public UUID getParentId() {
        return parentId;
    }

    public int getLevel() {
        return level;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public boolean isActive() {
        return active;
    }

    public void setName(String name) {
        this.name = name;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
