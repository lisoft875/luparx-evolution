package cr.luparx.app.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * One link of a municipality's audit chain ({@code audit_seals}, V31_0 — CONTRACT.md v0.32).
 *
 * <p>The database trigger stops the trail being <b>deleted</b>. This is what makes a deletion
 * <b>provable</b>, which is not the same thing: a PostgreSQL superuser can disable a trigger, and
 * what is left after that is that the arithmetic no longer adds up and anybody can check it.</p>
 *
 * <p>A seal covers a window of one municipality's entries and carries the digest of those rows plus
 * the digest of the seal before it. Removing, altering or inserting a row inside a window that is
 * already sealed changes that window's digest, and because each seal chains to the previous one it
 * cannot be repaired by recomputing a single seal: the whole chain from there on would have to be
 * rebuilt — and the auditor holds their own copy of the seals they were handed before.</p>
 *
 * <h2>Why a separate table</h2>
 *
 * <p>This is the decision the rest depends on. If the digest lived in a column of {@code
 * audit_events}, sealing would be an {@code UPDATE} on {@code audit_events} — and then the trigger
 * could not forbid {@code UPDATE}, which is precisely what has to be forbidden.</p>
 *
 * <h2>Why per municipality</h2>
 *
 * <p>Because auditing happens per municipality: a canton is handed its own chain and verifies it
 * without seeing anybody else's. Platform-scoped actions have a chain of their own under a sentinel
 * key, since a null cannot be a chain key.</p>
 */
@Entity
@Table(name = "audit_seals")
public class AuditSeal {

    /**
     * The chain key for entries that belong to no municipality — a platform operator crossing a
     * tenant boundary, the retention job, a failed login before any tenant is known.
     */
    public static final UUID PLATFORM_KEY = new UUID(0L, 0L);

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_key", nullable = false)
    private UUID tenantKey;

    /** Consecutive within this municipality's chain. A gap is, on its own, a finding. */
    @Column(name = "seq", nullable = false)
    private long seq;

    @Column(name = "covers_from", nullable = false)
    private Instant coversFrom;

    @Column(name = "covers_to", nullable = false)
    private Instant coversTo;

    @Column(name = "row_count", nullable = false)
    private int rowCount;

    @Column(name = "digest", nullable = false, length = 64)
    private String digest;

    /** The digest of the previous seal of this chain. Null only on the first. */
    @Column(name = "prev_digest", length = 64)
    private String prevDigest;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AuditSeal() {
        // for JPA
    }

    public AuditSeal(UUID id, UUID tenantKey, long seq, Instant coversFrom, Instant coversTo, int rowCount,
                     String digest, String prevDigest, Instant createdAt) {
        this.id = id;
        this.tenantKey = tenantKey;
        this.seq = seq;
        this.coversFrom = coversFrom;
        this.coversTo = coversTo;
        this.rowCount = rowCount;
        this.digest = digest;
        this.prevDigest = prevDigest;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantKey() {
        return tenantKey;
    }

    public long getSeq() {
        return seq;
    }

    public Instant getCoversFrom() {
        return coversFrom;
    }

    public Instant getCoversTo() {
        return coversTo;
    }

    public int getRowCount() {
        return rowCount;
    }

    public String getDigest() {
        return digest;
    }

    public String getPrevDigest() {
        return prevDigest;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
