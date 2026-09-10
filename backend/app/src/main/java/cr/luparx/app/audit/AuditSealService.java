package cr.luparx.app.audit;

import cr.luparx.core.audit.AuditChange;
import cr.luparx.core.id.Uuid7;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.UUID;

/**
 * Seals the audit trail into a chain, and verifies it (CONTRACT.md v0.32).
 *
 * <h2>What this is for</h2>
 *
 * <p>"An administrator must not be able to delete the trail silently." Two mechanisms answer that and
 * neither is enough alone. A database trigger <b>stops</b> the deletion — from the application, from
 * a console, from an integration — and a PostgreSQL superuser can disable a trigger. This chain makes
 * a deletion <b>provable</b> afterwards, by anybody, including a municipality's own auditor holding a
 * copy of the seals they were handed last quarter.</p>
 *
 * <h2>Sealing lags on purpose</h2>
 *
 * <p>A window is sealed only once it is {@link #SEAL_LAG} old. An entry is stamped with its
 * {@code occurredAt} when it is written and becomes visible when its transaction commits, so a window
 * sealed the instant it closed could miss a row that was still in flight — and the chain would then
 * accuse the platform of losing a row it never lost. The lag is the price of not raising a false
 * alarm, and the trigger is what protects those minutes meanwhile.</p>
 *
 * <p>A row that turns up inside an already-sealed window afterwards is <em>reported</em> by
 * {@link #verify} rather than quietly folded in. Whether that is a clock problem or something worse
 * is a judgement for a person; hiding it would make the chain a decoration.</p>
 */
@Service
public class AuditSealService {

    /**
     * How far behind now a window has to be before it is sealed.
     *
     * <p>Five minutes is far longer than any transaction in this platform lives, and short enough
     * that an entry is provable within the same hour it happened.</p>
     */
    public static final Duration SEAL_LAG = Duration.ofMinutes(5);

    /** Longest window one seal may cover, so a chain left idle does not seal a year in one link. */
    private static final Duration MAX_WINDOW = Duration.ofDays(1);

    /** How many links a verification walks. A whole chain is an export, not a screen. */
    private static final int MAX_VERIFIED_SEALS = 500;

    /**
     * Separates the fields of one entry inside the digest.
     *
     * <p>ASCII unit separator: it cannot occur in any of the values, which is what makes the line
     * unambiguous. A comma would let a metadata value containing a comma impersonate a field
     * boundary, and a digest that can be steered by its own input proves nothing.</p>
     */
    private static final char FIELD_SEPARATOR = '\u001F';

    private final AuditEventRepository eventRepository;
    private final AuditSealRepository sealRepository;
    private final Clock clock;

    public AuditSealService(AuditEventRepository eventRepository, AuditSealRepository sealRepository, Clock clock) {
        this.eventRepository = eventRepository;
        this.sealRepository = sealRepository;
        this.clock = clock;
    }

    /**
     * Adds every seal that is due for one chain, oldest first.
     *
     * @param tenantId the municipality, or null for the platform chain
     * @return how many seals were written; zero is the ordinary answer for a quiet chain
     */
    @Transactional
    public int seal(UUID tenantId) {
        boolean platform = tenantId == null;
        UUID chainKey = platform ? AuditSeal.PLATFORM_KEY : tenantId;
        Instant horizon = clock.instant().minus(SEAL_LAG);

        AuditSeal last = sealRepository.findFirstByTenantKeyOrderBySeqDesc(chainKey).orElse(null);
        Instant from = last != null
                ? last.getCoversTo()
                : eventRepository.findEarliest(tenantId, platform);
        if (from == null) {
            // Nothing was ever written to this chain. Sealing an empty range would add a link that
            // proves nothing about anything.
            return 0;
        }

        int written = 0;
        while (from.isBefore(horizon)) {
            Instant to = from.plus(MAX_WINDOW).isBefore(horizon) ? from.plus(MAX_WINDOW) : horizon;
            List<AuditEventEntity> entries = eventRepository.findForSeal(tenantId, platform, from, to);
            String prev = last == null ? null : last.getDigest();
            last = sealRepository.save(new AuditSeal(Uuid7.generate(), chainKey,
                    last == null ? 1L : last.getSeq() + 1L, from, to, entries.size(),
                    digestOf(prev, entries), prev, clock.instant()));
            written++;
            from = to;
        }
        return written;
    }

    /** Seals every chain that has anything in it. What the scheduled job calls. */
    @Transactional
    public int sealAll() {
        int written = seal(null);
        for (UUID tenantId : eventRepository.findTenantsWithEvents()) {
            if (tenantId != null) {
                written += seal(tenantId);
            }
        }
        return written;
    }

    /**
     * Recomputes a chain against the entries that are in the database right now, and reports what
     * does not match.
     *
     * <p>Three things can be wrong and they are reported apart, because they mean different things: a
     * <b>digest</b> that no longer matches means rows inside that window changed or disappeared; a
     * broken <b>link</b> means a seal itself was replaced; a missing <b>consecutive</b> means a seal
     * was removed.</p>
     */
    @Transactional(readOnly = true)
    public Verification verify(UUID tenantId) {
        boolean platform = tenantId == null;
        UUID chainKey = platform ? AuditSeal.PLATFORM_KEY : tenantId;
        List<AuditSeal> seals = sealRepository.findByTenantKeyOrderBySeqAsc(chainKey);
        if (seals.size() > MAX_VERIFIED_SEALS) {
            seals = seals.subList(seals.size() - MAX_VERIFIED_SEALS, seals.size());
        }

        List<Problem> problems = new ArrayList<>();
        long expectedSeq = seals.isEmpty() ? 0L : seals.get(0).getSeq();
        String previousDigest = seals.isEmpty() ? null : seals.get(0).getPrevDigest();
        long rows = 0L;

        for (AuditSeal seal : seals) {
            if (seal.getSeq() != expectedSeq) {
                // A missing consecutive is a finding on its own: seals are never deleted either.
                problems.add(new Problem(seal.getSeq(), ProblemKind.MISSING_SEAL,
                        "expected seal " + expectedSeq + ", found " + seal.getSeq()));
            }
            if (!Objects.equals(seal.getPrevDigest(), previousDigest)) {
                problems.add(new Problem(seal.getSeq(), ProblemKind.BROKEN_LINK,
                        "this seal does not follow the one before it"));
            }
            List<AuditEventEntity> entries = eventRepository.findForSeal(tenantId, platform,
                    seal.getCoversFrom(), seal.getCoversTo());
            rows += entries.size();
            if (!digestOf(seal.getPrevDigest(), entries).equals(seal.getDigest())) {
                problems.add(new Problem(seal.getSeq(), ProblemKind.DIGEST_MISMATCH,
                        "sealed " + seal.getRowCount() + " entries, found " + entries.size()));
            }
            previousDigest = seal.getDigest();
            expectedSeq = seal.getSeq() + 1L;
        }

        Instant sealedThrough = seals.isEmpty() ? null : seals.get(seals.size() - 1).getCoversTo();
        return new Verification(seals.size(), rows, sealedThrough, problems.isEmpty(), List.copyOf(problems));
    }

    /** The most recent links of a chain, for a screen. */
    @Transactional(readOnly = true)
    public List<AuditSeal> recent(UUID tenantId, int limit) {
        UUID chainKey = tenantId == null ? AuditSeal.PLATFORM_KEY : tenantId;
        return sealRepository.findByTenantKeyOrderBySeqDesc(chainKey, PageRequest.of(0, limit));
    }

    // --- the digest --------------------------------------------------------------------------------

    /**
     * The digest of one window: the previous seal's digest, then every entry in order.
     *
     * <p>Computed in Java and not in SQL on purpose. Doing it in the database would need an extension
     * that may not be installed, and would tie the proof to one engine's text rendering of
     * {@code jsonb} — exactly the sort of thing that changes in a minor upgrade and would make a whole
     * chain fail to verify for no real reason.</p>
     */
    private String digestOf(String previousDigest, List<AuditEventEntity> entries) {
        StringBuilder canonical = new StringBuilder(256 * (entries.size() + 1));
        canonical.append(previousDigest == null ? "-" : previousDigest).append('\n');
        for (AuditEventEntity entry : entries) {
            canonical.append(canonicalise(entry)).append('\n');
        }
        return sha256(canonical.toString());
    }

    /**
     * One entry as an unambiguous line of text.
     *
     * <p>Maps are written with their keys sorted and lists in their stored order: two servers have to
     * reach the same digest for the same rows, and a hash that depended on the iteration order of a
     * {@code HashMap} would differ between two instances of the same application — which reads
     * exactly like tampering.</p>
     *
     * <p>{@code userAgent} and {@code traceId} are deliberately <b>not</b> in it. They are context
     * about the request, not about the act: including them would make the proof depend on a header a
     * client chooses, and a browser that changed its user agent between a write and a verification
     * would break a chain it had nothing to do with.</p>
     */
    private static String canonicalise(AuditEventEntity entry) {
        StringBuilder line = new StringBuilder(256);
        append(line, entry.getId());
        append(line, entry.getTenantId());
        append(line, entry.getActorUserId());
        append(line, entry.getActorPortal());
        append(line, entry.getAction());
        append(line, entry.getResourceType());
        append(line, entry.getResourceId());
        append(line, entry.getIpHash());
        append(line, entry.getOccurredAt());
        append(line, sortedMap(entry.getMetadata()));
        append(line, changes(entry.getChanges()));
        return line.toString();
    }

    private static void append(StringBuilder line, Object value) {
        line.append(value == null ? "" : String.valueOf(value)).append(FIELD_SEPARATOR);
    }

    private static String sortedMap(Map<String, Object> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return "{}";
        }
        StringBuilder builder = new StringBuilder("{");
        for (Map.Entry<String, Object> entry : new TreeMap<>(metadata).entrySet()) {
            builder.append(entry.getKey()).append('=').append(entry.getValue()).append(';');
        }
        return builder.append('}').toString();
    }

    private static String changes(List<AuditChange> changes) {
        if (changes == null || changes.isEmpty()) {
            return "[]";
        }
        StringBuilder builder = new StringBuilder("[");
        for (AuditChange change : changes) {
            builder.append(change.field()).append(':')
                    .append(change.oldValue()).append('>')
                    .append(change.newValue()).append(';');
        }
        return builder.append(']').toString();
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is not available", impossible);
        }
    }

    /** What a verification found. {@code intact} with no problems is the answer somebody wants. */
    public record Verification(int sealCount, long entryCount, Instant sealedThrough, boolean intact,
                               List<Problem> problems) {
    }

    public record Problem(long seq, ProblemKind kind, String detail) {
    }

    /** The three ways a chain can be wrong, kept apart because they mean different things. */
    public enum ProblemKind {
        /** Rows inside a sealed window changed or disappeared. */
        DIGEST_MISMATCH,
        /** A seal itself was replaced: it no longer follows the one before it. */
        BROKEN_LINK,
        /** A consecutive is missing: a seal was removed. */
        MISSING_SEAL
    }
}
