package cr.luparx.geo.entity;

import cr.luparx.core.time.Easter;
import cr.luparx.core.time.HolidayObservance;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

/**
 * One public holiday of a country, as a rule ({@code holiday_catalog}, V30_0 — CONTRACT.md v0.31).
 *
 * <p>Platform reference data, like the country catalogue and the administrative divisions: it belongs
 * to no municipality, and a new country is rows rather than code. It lives in {@code module-geo}
 * because a country's holidays are a fact about the country, not about parking — the parking domain
 * never reads this table, it reads the exceptions a municipality copied from it.</p>
 *
 * <p>The name is stored as text and not as a translation key, for the same reason "Escazú" is: the
 * name of a holiday is a proper noun in the country's own language, not a label to be translated.
 * {@link #getCode()} is the stable handle for anyone who ever wants to.</p>
 *
 * <p><b>This is not legal advice, and the screen says so.</b> Holiday law changes; what a canton
 * charges on is the canton's answer to give. That is exactly why a municipality <em>copies</em> these
 * rules into its own exceptions instead of the platform reading this table at pricing time: once
 * copied they are the municipality's, and editing or deleting one does not require the platform to
 * agree.</p>
 */
@Entity
@Table(name = "holiday_catalog")
public class HolidayCatalogEntry {

    /** How the nominal date is computed. There is no "one date" here: a catalogue entry recurs. */
    public enum Kind {
        /** A day of the year: the 15th of September. */
        FIXED,
        /** A number of days from Easter Sunday, which is how the moveable feasts are defined. */
        EASTER
    }

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "country_code", nullable = false, length = 2)
    private String countryCode;

    @Column(name = "code", nullable = false, length = 48)
    private String code;

    @Column(name = "name", nullable = false, length = 160)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 8)
    private Kind kind;

    @Column(name = "month")
    private Short month;

    @Column(name = "day")
    private Short day;

    @Column(name = "easter_offset_days")
    private Short easterOffsetDays;

    @Enumerated(EnumType.STRING)
    @Column(name = "observance", nullable = false, length = 8)
    private HolidayObservance observance;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "active", nullable = false)
    private boolean active;

    protected HolidayCatalogEntry() {
        // for JPA
    }

    public UUID getId() {
        return id;
    }

    public String getCountryCode() {
        return countryCode;
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public Kind getKind() {
        return kind;
    }

    public Short getMonth() {
        return month;
    }

    public Short getDay() {
        return day;
    }

    public Short getEasterOffsetDays() {
        return easterOffsetDays;
    }

    public HolidayObservance getObservance() {
        return observance == null ? HolidayObservance.EXACT : observance;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public boolean isActive() {
        return active;
    }

    /**
     * The date this holiday is observed in {@code year}, so a screen can show the municipality what
     * it is about to accept rather than a rule it has to evaluate in its head.
     *
     * @return empty when the rule lands nowhere real that year — 29 February in a common year, or a
     *         year outside the range the computus is defined for
     */
    public Optional<LocalDate> observedIn(int year) {
        LocalDate nominal;
        if (kind == Kind.EASTER) {
            if (easterOffsetDays == null) {
                return Optional.empty();
            }
            try {
                nominal = Easter.sunday(year).plusDays(easterOffsetDays.intValue());
            } catch (IllegalArgumentException outOfRange) {
                return Optional.empty();
            }
        } else {
            if (month == null || day == null) {
                return Optional.empty();
            }
            try {
                nominal = LocalDate.of(year, month.intValue(), day.intValue());
            } catch (java.time.DateTimeException notADate) {
                return Optional.empty();
            }
        }
        return Optional.of(getObservance().observed(nominal));
    }
}
