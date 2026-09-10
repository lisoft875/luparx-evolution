package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * How long the platform keeps records that are large, personal, or both ({@code luparx.retention.*}).
 *
 * <p>Configuration and not a constant, because the legal answer changes by country: the period a
 * municipality must be able to justify a citation is not the same in Costa Rica as anywhere else, and
 * a number compiled into a jar cannot follow the platform abroad (ADR 0013, SECURITY.md §11).</p>
 *
 * @param enabled             whether the purge runs at all. Off is a legitimate deployment choice —
 *                            a regulator may require a hold — and it is a switch rather than a
 *                            retention of "forever", so the intent stays readable
 * @param enforcementChecks   how long a plate lookup is kept. It answers "was this car looked at
 *                            before it was fined", so it has to outlive the period in which somebody
 *                            can still challenge the citation
 * @param batchSize           rows deleted per transaction. Small enough not to lock a table officers
 *                            are writing to right now
 * @param maxPerRun           ceiling per run, so one enormous backlog never becomes one enormous
 *                            transaction; whatever is left waits for the next hour
 */
@ConfigurationProperties(prefix = "luparx.retention")
public record RetentionProperties(
        Boolean enabled,
        Duration enforcementChecks,
        Integer batchSize,
        Integer maxPerRun) {

    private static final Duration DEFAULT_ENFORCEMENT_CHECKS = Duration.ofDays(365);
    private static final int DEFAULT_BATCH_SIZE = 1_000;
    private static final int DEFAULT_MAX_PER_RUN = 100_000;

    /**
     * On unless a deployment says otherwise.
     *
     * <p>The safe default for an unset retention switch is the documented policy, not "keep
     * everything forever": a platform that quietly accumulates positions and plates because somebody
     * forgot a property is the failure this whole file exists to prevent.</p>
     */
    public boolean effectiveEnabled() {
        return enabled == null || enabled;
    }

    /** Never null and never zero — an unset property must not mean "delete everything". */
    public Duration effectiveEnforcementChecks() {
        return enforcementChecks == null || enforcementChecks.isZero() || enforcementChecks.isNegative()
                ? DEFAULT_ENFORCEMENT_CHECKS
                : enforcementChecks;
    }

    public int effectiveBatchSize() {
        return batchSize == null || batchSize <= 0 ? DEFAULT_BATCH_SIZE : batchSize;
    }

    public int effectiveMaxPerRun() {
        return maxPerRun == null || maxPerRun <= 0 ? DEFAULT_MAX_PER_RUN : maxPerRun;
    }
}
