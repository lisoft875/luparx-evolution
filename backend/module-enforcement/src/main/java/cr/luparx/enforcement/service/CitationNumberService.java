package cr.luparx.enforcement.service;

import cr.luparx.core.id.TenantId;
import cr.luparx.enforcement.entity.CitationNumberCounter;
import cr.luparx.enforcement.repository.CitationNumberCounterRepository;
import cr.luparx.tenancy.entity.Tenant;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Locale;

/**
 * Gives a citation the number a human will actually quote.
 *
 * <h2>Why not the UUID</h2>
 *
 * <p>Nobody disputes {@code 01a083e7-9353-79f4-91f8-3dcf8e5099c9} over a counter, reads it down a
 * telephone or writes it on a payment slip. The consecutive is what the citizen, the cashier and the
 * municipal lawyer refer to, so it is part of the act: {@code SJ-2026-000041}.</p>
 *
 * <h2>Per municipality and per year</h2>
 *
 * <p>Both are legal requirements, not preferences: a municipality numbers <em>its</em> acts, and the
 * series restarts with the fiscal year. The year is taken in the <b>municipality's time zone</b> — a
 * citation issued at 22:30 on 31 December in San José belongs to that year, and computing it in UTC
 * would file it in the next one.</p>
 *
 * <h2>No gaps, no duplicates, with any number of instances</h2>
 *
 * <p>The counter row is locked with {@code SELECT … FOR UPDATE} and incremented inside the same
 * transaction that inserts the citation. Two instances issuing at the same instant queue on the row;
 * a transaction that fails gives its number back. See {@code CitationNumberCounter} for the
 * alternatives that were rejected (a database sequence, which cannot be per tenant-year without DDL
 * at runtime and leaves holes) and for the contention this accepts.</p>
 *
 * <p><b>A number is taken at issue, never at capture.</b> A draft that an officer abandons must not
 * consume one, because a municipality has to be able to say that the series is complete.</p>
 */
@Service
public class CitationNumberService {

    /** Digits in the sequence. Six carries a million citations a year in one municipality. */
    private static final int SEQUENCE_DIGITS = 6;

    /** Longest prefix taken from the municipality's short name or slug. */
    private static final int MAX_PREFIX = 6;

    /** Used only if a municipality has neither a short name nor a usable slug, which cannot happen. */
    private static final String FALLBACK_PREFIX = "MUN";

    private final CitationNumberCounterRepository counterRepository;

    public CitationNumberService(CitationNumberCounterRepository counterRepository) {
        this.counterRepository = counterRepository;
    }

    /**
     * Takes the next number of this municipality's series for the year {@code at} falls in.
     *
     * <p>{@code REQUIRED} on purpose: it must join the caller's transaction, so that the number and
     * the citation commit or roll back together. Running it in its own transaction would be how the
     * series grows holes.</p>
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public Assigned next(Tenant tenant, Instant at) {
        int year = yearIn(tenant, at);
        CitationNumberCounter counter = counterRepository.lock(tenant.getId(), year)
                .orElseGet(() -> createSeries(tenant, year, at));
        long sequence = counter.next(at);
        counterRepository.save(counter);
        return new Assigned(format(prefixOf(tenant), year, sequence), year, sequence);
    }

    /**
     * The first citation of a year creates the series. Two officers can reach this at the same
     * moment; the primary key decides, and the loser re-reads the row the winner inserted instead of
     * failing an act that is otherwise perfectly valid.
     */
    private CitationNumberCounter createSeries(Tenant tenant, int year, Instant at) {
        try {
            return counterRepository.saveAndFlush(new CitationNumberCounter(tenant.getId(), year, at));
        } catch (DataIntegrityViolationException concurrent) {
            return counterRepository.lock(tenant.getId(), year)
                    .orElseThrow(() -> concurrent);
        }
    }

    /** The year in the municipality's own time zone (CONTRACT.md §7: UTC in store, local at the edge). */
    public int yearIn(Tenant tenant, Instant at) {
        return ZonedDateTime.ofInstant(at, zoneOf(tenant)).getYear();
    }

    private ZoneId zoneOf(Tenant tenant) {
        try {
            return ZoneId.of(tenant.getTimeZone());
        } catch (RuntimeException invalid) {
            // A tenant with an unusable zone is a configuration bug, not a reason to refuse an act
            // an officer is standing in the street performing. UTC is stated, not silently assumed.
            return ZoneId.of("UTC");
        }
    }

    /**
     * The letters in front of the number, derived from the municipality's short name (or its slug)
     * and <b>copied into the citation</b>. Deriving it keeps the platform from needing a second
     * setting nobody would remember to fill; copying it means that renaming the municipality next
     * year never rewrites numbers already issued, which is the property that matters.
     */
    public String prefixOf(Tenant tenant) {
        String source = tenant.getShortName() != null && !tenant.getShortName().isBlank()
                ? tenant.getShortName()
                : tenant.getSlug();
        StringBuilder builder = new StringBuilder(MAX_PREFIX);
        for (int index = 0; index < source.length() && builder.length() < MAX_PREFIX; index++) {
            char character = Character.toUpperCase(source.charAt(index));
            if ((character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9')) {
                builder.append(character);
            }
        }
        return builder.isEmpty() ? FALLBACK_PREFIX : builder.toString();
    }

    private String format(String prefix, int year, long sequence) {
        return String.format(Locale.ROOT, "%s-%d-%0" + SEQUENCE_DIGITS + "d", prefix, year, sequence);
    }

    /** The number and the two parts it is made of, both stored so the series can be audited. */
    public record Assigned(String number, int seriesYear, long sequence) {
    }
}
