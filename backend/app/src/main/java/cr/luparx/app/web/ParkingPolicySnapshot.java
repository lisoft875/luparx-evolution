package cr.luparx.app.web;

import cr.luparx.core.audit.AuditChange;
import cr.luparx.core.audit.AuditChanges;
import cr.luparx.parking.entity.ParkingPolicy;

import java.util.List;

/**
 * A parking policy as it was, so the audit entry can say what each number changed <em>from</em>
 * (CONTRACT.md v0.32).
 *
 * <p>A copy taken before the write and not the entity itself, and that is the whole reason this class
 * exists. {@code ParkingPolicyService.replace} mutates the managed row in place, so holding a
 * reference to it and reading it afterwards yields the <b>new</b> values — an audit trail that
 * confidently reports "480 → 480" for every field, which is worse than no trail at all because it
 * reads as evidence that nothing changed.</p>
 *
 * <p>Every field of the policy is compared. This is the municipality's own rulebook: what it sells,
 * for how long, whether minutes come back — an auditor asking why a citizen was charged differently
 * last March needs all of it, and none of it is personal data.</p>
 */
record ParkingPolicySnapshot(String sessionIncrements, int sessionMin, int sessionMax,
                             boolean extensionEnabled, String extensionIncrements, int extensionMaxTotal,
                             boolean earlyFinishEnabled, boolean creditOnEarlyFinishEnabled,
                             int creditMinRemaining, int creditExpiryDays, int graceMinutes, int freeMinutes,
                             boolean overlappingStaysEnabled) {

    static ParkingPolicySnapshot of(ParkingPolicy policy) {
        return new ParkingPolicySnapshot(
                policy.getSessionIncrementsMinutes(),
                policy.getSessionMinMinutes(),
                policy.getSessionMaxMinutes(),
                policy.isExtensionEnabled(),
                policy.getExtensionIncrementsMinutes(),
                policy.getExtensionMaxTotalMinutes(),
                policy.isEarlyFinishEnabled(),
                policy.isCreditOnEarlyFinishEnabled(),
                policy.getCreditMinRemainingMinutes(),
                policy.getCreditExpiryDays(),
                policy.getGraceMinutes(),
                policy.getFreeMinutes(),
                policy.isOverlappingStaysEnabled());
    }

    /** What changed between this snapshot and the policy as it now stands. Unchanged fields drop out. */
    List<AuditChange> diff(ParkingPolicy now) {
        return AuditChanges.builder()
                .compare("sessionIncrementsMinutes", sessionIncrements, now.getSessionIncrementsMinutes())
                .compare("sessionMinMinutes", Integer.valueOf(sessionMin),
                        Integer.valueOf(now.getSessionMinMinutes()))
                .compare("sessionMaxMinutes", Integer.valueOf(sessionMax),
                        Integer.valueOf(now.getSessionMaxMinutes()))
                .compare("extensionEnabled", Boolean.valueOf(extensionEnabled),
                        Boolean.valueOf(now.isExtensionEnabled()))
                .compare("extensionIncrementsMinutes", extensionIncrements, now.getExtensionIncrementsMinutes())
                .compare("extensionMaxTotalMinutes", Integer.valueOf(extensionMaxTotal),
                        Integer.valueOf(now.getExtensionMaxTotalMinutes()))
                .compare("earlyFinishEnabled", Boolean.valueOf(earlyFinishEnabled),
                        Boolean.valueOf(now.isEarlyFinishEnabled()))
                .compare("creditOnEarlyFinishEnabled", Boolean.valueOf(creditOnEarlyFinishEnabled),
                        Boolean.valueOf(now.isCreditOnEarlyFinishEnabled()))
                .compare("creditMinRemainingMinutes", Integer.valueOf(creditMinRemaining),
                        Integer.valueOf(now.getCreditMinRemainingMinutes()))
                .compare("creditExpiryDays", Integer.valueOf(creditExpiryDays),
                        Integer.valueOf(now.getCreditExpiryDays()))
                .compare("graceMinutes", Integer.valueOf(graceMinutes), Integer.valueOf(now.getGraceMinutes()))
                .compare("freeMinutes", Integer.valueOf(freeMinutes), Integer.valueOf(now.getFreeMinutes()))
                // Turning this off is how a municipality goes back to selling each bay once. It decides
                // whether a citizen standing at an unreleased bay can pay at all, so it belongs in the
                // trail beside the numbers.
                .compare("overlappingStaysEnabled", Boolean.valueOf(overlappingStaysEnabled),
                        Boolean.valueOf(now.isOverlappingStaysEnabled()))
                .build();
    }
}
