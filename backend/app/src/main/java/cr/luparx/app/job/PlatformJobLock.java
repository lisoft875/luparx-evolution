package cr.luparx.app.job;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.function.Supplier;
import java.util.zip.CRC32;

/**
 * Runs a scheduled job on <b>one</b> backend instance at a time.
 *
 * <p>Every replica of this application runs the same schedule, so without this the retention purge
 * would start on all of them at the same second — several transactions deleting overlapping ranges
 * of the same table, which is wasted work at best and lock contention on a table officers are writing
 * to at worst.</p>
 *
 * <p>The lock is PostgreSQL's own advisory lock, and that choice is the point: the platform's rule is
 * that nothing depends on process-local state for correctness (docs/ARCHITECTURE.md §7), and an
 * in-process {@code synchronized} or a {@code static boolean} would be exactly that — invisible to
 * the other three replicas. It needs no table, no library and no cleanup: the lock is released when
 * the transaction ends, including when the instance holding it dies mid-job, which is the failure
 * mode a lock row in a table gets wrong.</p>
 *
 * <p>{@code try}, never {@code wait}: an instance that does not get the lock skips this run entirely
 * rather than queueing behind the one that did. A purge that runs hourly has nothing to gain from
 * running twice in a row, and a queue of blocked replicas is a connection pool waiting to be
 * exhausted.</p>
 */
@Component
public class PlatformJobLock {

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * Runs {@code work} if this instance can take the named lock right now.
     *
     * <p>Everything runs inside one transaction, which is also what bounds the lock's life. That
     * couples the two on purpose: a job whose transaction has ended has no business still holding a
     * lock, and one still working must not have lost it.</p>
     *
     * @return the job's result, or empty when another instance is already running it
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public <T> java.util.Optional<T> runExclusively(String jobName, Supplier<T> work) {
        Boolean acquired = (Boolean) entityManager
                .createNativeQuery("select pg_try_advisory_xact_lock(:key)")
                .setParameter("key", lockKey(jobName))
                .getSingleResult();
        if (!Boolean.TRUE.equals(acquired)) {
            return java.util.Optional.empty();
        }
        return java.util.Optional.ofNullable(work.get());
    }

    /**
     * A stable 64-bit key from the job's name.
     *
     * <p>Advisory locks are keyed by number, not by string, so the name has to become one. A hash of
     * the name is stable across restarts and deployments — which is what matters — and a collision
     * between two of this platform's handful of job names would only mean they never run at the same
     * moment, which is a performance detail and not a correctness one.</p>
     */
    static long lockKey(String jobName) {
        CRC32 crc = new CRC32();
        crc.update(jobName.getBytes(StandardCharsets.UTF_8));
        return crc.getValue();
    }
}
