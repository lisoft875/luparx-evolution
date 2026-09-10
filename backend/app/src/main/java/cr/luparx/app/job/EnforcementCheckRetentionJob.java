package cr.luparx.app.job;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.config.RetentionProperties;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.enforcement.service.EnforcementCheckService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;

/**
 * Deletes fiscalisation-log entries past their retention window (CONTRACT.md v0.29, ADR 0013).
 *
 * <p>The first scheduled job this platform has, and it exists because the log it purges is the
 * largest table the platform will own: hundreds of rows per officer per shift, carrying plates,
 * timestamps and — when the officer has granted it — positions. ADR 0013 and SECURITY.md §11 have
 * promised a retention policy since v0.1; this is the first half of keeping that promise, for the
 * table where the promise matters most.</p>
 *
 * <h2>The three things a purge has to get right</h2>
 *
 * <p><b>One instance at a time.</b> Every replica runs the same schedule, so the job takes a
 * PostgreSQL advisory lock and the replicas that do not get it skip the run rather than queue behind
 * it (see {@link PlatformJobLock}).</p>
 *
 * <p><b>In batches.</b> A single statement over a year of a busy municipality's lookups holds a long
 * lock on a table officers are writing to right now, and the officer in the street does not care that
 * it is purge night. Each batch is its own transaction, so a slow night stops cleanly between batches
 * instead of rolling back an hour of work.</p>
 *
 * <p><b>Audited itself.</b> ADR 0013 is explicit that deletion of retained data is never a silent
 * statement against production: the entry says which policy ran, what the cutoff was and how many
 * rows went. A purge that leaves no trace is indistinguishable from data loss.</p>
 */
@Component
public class EnforcementCheckRetentionJob {

    private static final Logger LOGGER = LoggerFactory.getLogger(EnforcementCheckRetentionJob.class);
    private static final String JOB_NAME = "enforcement-check-retention";

    private final EnforcementCheckService checkService;
    private final RetentionProperties properties;
    private final PlatformJobLock jobLock;
    private final AuditRecorder auditRecorder;
    private final Clock clock;

    public EnforcementCheckRetentionJob(EnforcementCheckService checkService,
                                        RetentionProperties properties,
                                        PlatformJobLock jobLock,
                                        AuditRecorder auditRecorder,
                                        Clock clock) {
        this.checkService = checkService;
        this.properties = properties;
        this.jobLock = jobLock;
        this.auditRecorder = auditRecorder;
        this.clock = clock;
    }

    /**
     * Hourly rather than nightly, on purpose.
     *
     * <p>A nightly job that fails leaves a day of growth and nobody notices until the table is a
     * problem; an hourly one that fails has already deleted most of what was due and will try again
     * within the hour. It is also self-limiting: after the first pass there is rarely anything to do,
     * and a run with nothing due costs one indexed count.</p>
     */
    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT5M")
    public void purge() {
        if (!properties.effectiveEnabled()) {
            return;
        }
        Instant cutoff = clock.instant().minus(properties.effectiveEnforcementChecks());
        jobLock.runExclusively(JOB_NAME, () -> {
            long due = checkService.countDueForPurge(cutoff);
            if (due == 0) {
                return 0;
            }
            int batchSize = properties.effectiveBatchSize();
            int deleted = 0;
            // Bounded by more than the cutoff: a run that would delete millions stops and leaves the
            // rest for the next hour, so one enormous backlog can never become one enormous
            // transaction.
            int maxPerRun = properties.effectiveMaxPerRun();
            while (deleted < maxPerRun) {
                int removed = checkService.purgeBatch(cutoff, Math.min(batchSize, maxPerRun - deleted));
                deleted += removed;
                if (removed < batchSize) {
                    break;
                }
            }
            // No tenant and no actor: this is the platform acting on its own retention policy, and
            // pinning it on a municipality or a person would be a false attribution.
            auditRecorder.record(AuditAction.RETENTION_PURGE_RAN, "enforcement-checks", null, null, null, null,
                    Map.of("cutoff", cutoff.toString(),
                            "due", String.valueOf(due),
                            "deleted", String.valueOf(deleted),
                            "retentionDays", String.valueOf(properties.effectiveEnforcementChecks().toDays())));
            LOGGER.info("Retention purge of enforcement_checks: cutoff={} due={} deleted={}", cutoff, due, deleted);
            return deleted;
        });
    }
}
