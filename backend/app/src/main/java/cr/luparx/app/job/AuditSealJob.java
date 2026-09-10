package cr.luparx.app.job;

import cr.luparx.app.audit.AuditSealService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Adds the links that make the audit trail's integrity provable (CONTRACT.md v0.32).
 *
 * <p>The trigger in V31_0 is what <b>stops</b> the trail being altered. This is what makes an
 * alteration <b>provable</b> to somebody who was not there — a municipality's own auditor, holding
 * the seals they were given last quarter and checking them against the database today.</p>
 *
 * <h2>Why a job and not part of the write</h2>
 *
 * <p>Chaining each entry as it is written would mean every audited action taking a lock on its
 * municipality's chain head. Logins, parking starts and plate lookups are all audited, so that lock
 * would be the platform's busiest row, and a hash chain that made the product slower would end up
 * being switched off — which is worse than not having one.</p>
 *
 * <p>Sealing after the fact costs a window in which a row could be removed before it was ever
 * covered. That window is bounded by {@link AuditSealService#SEAL_LAG} plus this schedule, and it is
 * exactly the window the database trigger is protecting. The two mechanisms cover each other's gap,
 * which is why the answer to "an administrator must not be able to delete this silently" is both of
 * them rather than either.</p>
 *
 * <h2>One instance at a time</h2>
 *
 * <p>Every replica runs the same schedule, so the job takes the platform advisory lock and the ones
 * that do not get it skip the run rather than queue behind it. Two replicas sealing at once would
 * each read the same chain head and write two links with the same consecutive; the unique index
 * would refuse the second, but the clean answer is not to race at all.</p>
 *
 * <h2>It is not audited itself</h2>
 *
 * <p>Deliberately, unlike the retention purge. Sealing writes no state anybody could be wronged by
 * and reads nothing personal, and an entry per run would be one row every few minutes forever in the
 * table this job exists to protect — the chain would end up mostly recording that it ran. The seals
 * are their own record: their consecutives, their windows and their timestamps say exactly when the
 * job worked and when it did not.</p>
 */
@Component
public class AuditSealJob {

    private static final Logger LOGGER = LoggerFactory.getLogger(AuditSealJob.class);
    private static final String JOB_NAME = "audit-seal";

    private final AuditSealService sealService;
    private final PlatformJobLock jobLock;

    public AuditSealJob(AuditSealService sealService, PlatformJobLock jobLock) {
        this.sealService = sealService;
        this.jobLock = jobLock;
    }

    /**
     * Every ten minutes.
     *
     * <p>Frequent enough that an act is provable within the hour it happened, and rare enough that a
     * quiet platform spends nothing: a run with nothing due is one indexed read per chain.</p>
     */
    @Scheduled(fixedDelayString = "PT10M", initialDelayString = "PT2M")
    public void run() {
        try {
            jobLock.runExclusively(JOB_NAME, () -> {
                int written = sealService.sealAll();
                if (written > 0) {
                    LOGGER.info("Audit seals: {} new links written.", written);
                }
                return Integer.valueOf(written);
            });
        } catch (RuntimeException failure) {
            // Logged and swallowed: a sealing run that throws must not take the scheduler with it,
            // and the next run picks up exactly where this one stopped — the chain head is the only
            // state it keeps.
            LOGGER.error("Audit sealing failed; the next run will resume from the last seal.", failure);
        }
    }
}
