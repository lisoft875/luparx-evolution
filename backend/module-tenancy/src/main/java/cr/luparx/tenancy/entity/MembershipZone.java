package cr.luparx.tenancy.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * One sector a member of staff covers ({@code membership_zones}, V22_0 — CONTRACT.md v0.15).
 *
 * <p>It hangs off the <b>membership</b> and not the person: covering those sectors is a fact about
 * the post they hold in this municipality, and the same person can be an inspector in two
 * municipalities with different sectors in each.</p>
 *
 * <p>The zone is a raw id, like every cross-module reference in this package: module-tenancy must
 * not depend on module-parking at compile time. That the zone belongs to the same municipality as
 * the membership is an invariant the schema cannot state — it spans two tables — so the application
 * layer validates it before writing, and this is the note saying so out loud.</p>
 *
 * <p><b>No rows means no restriction.</b> An inspector with nothing assigned works the whole
 * municipality; it does not mean "assigned to nowhere". The second reading can only be reached by
 * an oversight and its only effect would be to stop somebody from doing their job.</p>
 */
@Entity
@Table(name = "membership_zones")
public class MembershipZone {

    @EmbeddedId
    private Id id;

    @Column(name = "assigned_at", nullable = false)
    private Instant assignedAt;

    protected MembershipZone() {
        // for JPA
    }

    public MembershipZone(UUID membershipId, UUID zoneId, Instant assignedAt) {
        this.id = new Id(membershipId, zoneId);
        this.assignedAt = assignedAt;
    }

    public UUID getMembershipId() {
        return id.membershipId;
    }

    public UUID getZoneId() {
        return id.zoneId;
    }

    public Instant getAssignedAt() {
        return assignedAt;
    }

    /** The natural key: a membership covers a zone once or not at all. */
    @Embeddable
    public static class Id implements Serializable {

        @Column(name = "membership_id", nullable = false)
        private UUID membershipId;

        @Column(name = "zone_id", nullable = false)
        private UUID zoneId;

        protected Id() {
            // for JPA
        }

        Id(UUID membershipId, UUID zoneId) {
            this.membershipId = membershipId;
            this.zoneId = zoneId;
        }

        @Override
        public boolean equals(Object other) {
            if (this == other) {
                return true;
            }
            if (!(other instanceof Id that)) {
                return false;
            }
            return Objects.equals(membershipId, that.membershipId) && Objects.equals(zoneId, that.zoneId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(membershipId, zoneId);
        }
    }
}
