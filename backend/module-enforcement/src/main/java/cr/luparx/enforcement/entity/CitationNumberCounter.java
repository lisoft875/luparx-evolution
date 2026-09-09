package cr.luparx.enforcement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * The consecutive series of one municipality for one year ({@code citation_number_counters}, V17_0).
 *
 * <p>Why a table and not a database sequence: the series is <b>per municipality and per year</b>, so
 * a sequence would mean creating one at runtime for every tenant-year pair — DDL from application
 * code, which is exactly what "never modify production schemas manually" is meant to prevent — and a
 * sequence deliberately does not roll back, so every failed attempt would leave a hole in a
 * numbering that a municipality has to be able to defend as complete.</p>
 *
 * <p>A row that is locked for update instead gives both properties: the increment is inside the same
 * transaction as the citation, so a rollback returns the number, and the lock is what makes two
 * backend instances issuing at the same instant produce {@code …-000041} and {@code …-000042} rather
 * than the same number twice. The cost is the contention it names honestly: issuing citations in one
 * municipality serialises on one row for the length of one insert. At the volume a municipality
 * writes citations — a few a minute at the busiest — that is nothing, and the day it is not, the fix
 * is a per-zone or per-officer series, which is a change to the prefix and not to this mechanism.</p>
 */
@Entity
@Table(name = "citation_number_counters")
@IdClass(CitationNumberCounter.Key.class)
public class CitationNumberCounter {

    @Id
    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Id
    @Column(name = "series_year", nullable = false)
    private int seriesYear;

    /** The last number handed out. The next citation takes {@code lastSequence + 1}. */
    @Column(name = "last_sequence", nullable = false)
    private long lastSequence;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CitationNumberCounter() {
        // for JPA
    }

    public CitationNumberCounter(UUID tenantId, int seriesYear, Instant now) {
        this.tenantId = tenantId;
        this.seriesYear = seriesYear;
        this.lastSequence = 0L;
        this.updatedAt = now;
    }

    public long next(Instant now) {
        this.lastSequence = Math.addExact(this.lastSequence, 1L);
        this.updatedAt = now;
        return this.lastSequence;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public int getSeriesYear() {
        return seriesYear;
    }

    public long getLastSequence() {
        return lastSequence;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    /** Composite key: the series belongs to one municipality in one year. */
    public static class Key implements Serializable {

        private static final long serialVersionUID = 1L;

        private UUID tenantId;
        private int seriesYear;

        public Key() {
        }

        public Key(UUID tenantId, int seriesYear) {
            this.tenantId = tenantId;
            this.seriesYear = seriesYear;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof Key key)) {
                return false;
            }
            return seriesYear == key.seriesYear && Objects.equals(tenantId, key.tenantId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(tenantId, seriesYear);
        }
    }
}
