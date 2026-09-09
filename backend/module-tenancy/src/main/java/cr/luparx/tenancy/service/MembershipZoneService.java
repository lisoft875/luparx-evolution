package cr.luparx.tenancy.service;

import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.domain.Portal;
import cr.luparx.tenancy.entity.MembershipZone;
import cr.luparx.tenancy.entity.TenantMembership;
import cr.luparx.tenancy.model.MembershipStatus;
import cr.luparx.tenancy.repository.MembershipZoneRepository;
import cr.luparx.tenancy.repository.TenantMembershipRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Which sectors a member of staff covers, and — since v0.15 — where they may act.
 *
 * <h2>The empty set means "everywhere", not "nowhere"</h2>
 *
 * <p>An officer with no zones assigned works the whole municipality. This is the single most
 * important line in the file, because the other reading is available and is wrong twice over: it
 * would lock out every inspector already working the day this ships, and it would turn an
 * administrator forgetting a field into an officer who cannot do their job and does not know why.
 * Restricting somebody is an act; it should require having performed it.</p>
 *
 * <p>The zone ids are not validated here against the municipality's own zones — module-tenancy does
 * not know what a parking zone is. The application layer resolves them first and passes only ids it
 * has confirmed belong to this tenant, which is also where the error the caller sees is chosen.</p>
 */
@Service
public class MembershipZoneService {

    private final MembershipZoneRepository zoneRepository;
    private final TenantMembershipRepository membershipRepository;
    private final Clock clock;

    public MembershipZoneService(MembershipZoneRepository zoneRepository,
                                 TenantMembershipRepository membershipRepository,
                                 Clock clock) {
        this.zoneRepository = zoneRepository;
        this.membershipRepository = membershipRepository;
        this.clock = clock;
    }

    /** The sectors assigned to one membership; empty means unrestricted. */
    @Transactional(readOnly = true)
    public List<UUID> zonesOf(UUID membershipId) {
        return zoneRepository.findByIdMembershipId(membershipId).stream()
                .map(MembershipZone::getZoneId)
                .toList();
    }

    /** The same, for a page of memberships at once — two queries for a staff list, never N+1. */
    @Transactional(readOnly = true)
    public Map<UUID, List<UUID>> zonesOf(Collection<UUID> membershipIds) {
        Map<UUID, List<UUID>> byMembership = new HashMap<>();
        if (membershipIds == null || membershipIds.isEmpty()) {
            return byMembership;
        }
        for (MembershipZone assignment : zoneRepository.findByMembershipIds(membershipIds)) {
            byMembership.computeIfAbsent(assignment.getMembershipId(), key -> new ArrayList<>())
                    .add(assignment.getZoneId());
        }
        return byMembership;
    }

    /**
     * Replaces the whole assignment in one call.
     *
     * <p>Replace and not add/remove: an administrator ticking boxes on a screen is stating what the
     * set should be, and expressing that as a diff is how two people editing the same officer end up
     * with a union of both intentions.</p>
     *
     * @param zoneIds ids already confirmed to belong to this membership's municipality; empty
     *                removes every restriction
     */
    @Transactional
    public List<UUID> replaceZones(UUID membershipId, Collection<UUID> zoneIds) {
        zoneRepository.deleteByMembershipId(membershipId);
        // Flushed before inserting, or the delete and the inserts reach the database in the order
        // Hibernate prefers rather than the order this method needs, and the primary key fires.
        zoneRepository.flush();
        Set<UUID> unique = new LinkedHashSet<>(zoneIds == null ? List.of() : zoneIds);
        Instant now = clock.instant();
        for (UUID zoneId : unique) {
            zoneRepository.save(new MembershipZone(membershipId, zoneId, now));
        }
        return List.copyOf(unique);
    }

    /**
     * The zones an inspector may act in right now, for the enforcement flow.
     *
     * @return empty when they are unrestricted — the caller must read that as "any zone of this
     *         municipality", which is why this returns a {@code List} and not an optional filter
     */
    @Transactional(readOnly = true)
    public List<UUID> activeZonesFor(TenantId tenantId, UserId userId, Portal portal) {
        return membershipRepository
                .findByTenantIdAndUserIdAndPortal(tenantId.value(), userId.value(), portal)
                .filter(membership -> membership.getStatus() == MembershipStatus.ACTIVE)
                .map(TenantMembership::getId)
                .map(this::zonesOf)
                .orElse(List.of());
    }
}
