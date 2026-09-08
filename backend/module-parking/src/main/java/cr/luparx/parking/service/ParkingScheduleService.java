package cr.luparx.parking.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.TimeZones;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.parking.entity.ParkingSchedule;
import cr.luparx.parking.entity.ParkingScheduleException;
import cr.luparx.parking.entity.ParkingScheduleExceptionSlot;
import cr.luparx.parking.entity.ParkingScheduleSlot;
import cr.luparx.parking.model.ChargingBand;
import cr.luparx.parking.model.ChargingDayRule;
import cr.luparx.parking.model.ChargingSchedule;
import cr.luparx.parking.model.ParkingScheduleDefaults;
import cr.luparx.parking.repository.ParkingScheduleExceptionRepository;
import cr.luparx.parking.repository.ParkingScheduleExceptionSlotRepository;
import cr.luparx.parking.repository.ParkingScheduleRepository;
import cr.luparx.parking.repository.ParkingScheduleSlotRepository;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Reads and writes a municipality's charging timetable, and turns its rows into the value object that
 * does the arithmetic ({@link ChargingSchedule}).
 *
 * <p>The split is the point. This class knows about rows, tenants and time zones; the value object
 * knows how many minutes of a stay fall inside a band and nothing else. That is what lets the rule
 * CONTRACT.md v0.3 cares about — "sólo se cobran los minutos que caen dentro de una franja" — be
 * tested exhaustively without a database.</p>
 *
 * <p>A municipality with no timetable is answered from {@code platform.defaults.parking.schedule.*}
 * and the rows are materialised on first read, so the administrator has something real to edit. The
 * default of this deployment is Monday to Saturday, 07:00 to 18:00, with Sunday not charged — a line
 * of YAML, not a constant in Java.</p>
 */
@Service
public class ParkingScheduleService {

    /**
     * How far ahead exceptions are loaded when looking for the next charging band. It matches the
     * value object's own limit; beyond it the answer is "this municipality does not charge".
     */
    private static final int LOOKAHEAD_DAYS = 370;

    /** Beyond this, a timetable form is not a timetable — it is an import that needs its own endpoint. */
    private static final int MAX_EXCEPTIONS = 400;

    private final ParkingScheduleRepository scheduleRepository;
    private final ParkingScheduleSlotRepository slotRepository;
    private final ParkingScheduleExceptionRepository exceptionRepository;
    private final ParkingScheduleExceptionSlotRepository exceptionSlotRepository;
    private final ParkingScheduleDefaults defaults;
    private final TenantService tenantService;
    private final Clock clock;

    public ParkingScheduleService(ParkingScheduleRepository scheduleRepository,
                                  ParkingScheduleSlotRepository slotRepository,
                                  ParkingScheduleExceptionRepository exceptionRepository,
                                  ParkingScheduleExceptionSlotRepository exceptionSlotRepository,
                                  ParkingScheduleDefaults defaults,
                                  TenantService tenantService,
                                  Clock clock) {
        this.scheduleRepository = scheduleRepository;
        this.slotRepository = slotRepository;
        this.exceptionRepository = exceptionRepository;
        this.exceptionSlotRepository = exceptionSlotRepository;
        this.defaults = defaults;
        this.tenantService = tenantService;
        this.clock = clock;
    }

    // --- reads -----------------------------------------------------------------------------------

    /** The header row, created from the configured defaults the first time anybody asks. */
    @Transactional
    public ParkingSchedule require(TenantId tenantId) {
        Optional<ParkingSchedule> existing = scheduleRepository.findById(tenantId.value());
        if (existing.isPresent()) {
            return existing.get();
        }
        Instant now = clock.instant();
        ParkingSchedule schedule = scheduleRepository.save(
                new ParkingSchedule(tenantId.value(), defaults.chargesAllDay(), now));
        List<ParkingScheduleSlot> seeded = new ArrayList<>();
        for (DayOfWeek weekday : DayOfWeek.values()) {
            if (defaults.chargingWeekdays().contains(weekday)) {
                seeded.add(new ParkingScheduleSlot(Uuid7.generate(), tenantId.value(), weekday, defaults.band(),
                        now));
            }
        }
        slotRepository.saveAll(seeded);
        return schedule;
    }

    /** Every band of the municipality, ordered, for the admin form. */
    @Transactional
    public List<ParkingScheduleSlot> slots(TenantId tenantId) {
        require(tenantId);
        return slotRepository.findByTenantIdOrderByWeekdayAscStartMinuteAsc(tenantId.value());
    }

    /** Every dated exception of the municipality, ordered, for the admin form. */
    @Transactional
    public List<ParkingScheduleException> exceptions(TenantId tenantId) {
        require(tenantId);
        return exceptionRepository.findByTenantIdOrderByExceptionDateAsc(tenantId.value());
    }

    /** The bands of the given exceptions, in one query. */
    @Transactional(readOnly = true)
    public Map<UUID, List<ChargingBand>> exceptionBands(List<ParkingScheduleException> exceptions) {
        if (exceptions == null || exceptions.isEmpty()) {
            return Map.of();
        }
        List<UUID> ids = exceptions.stream().map(ParkingScheduleException::getId).toList();
        Map<UUID, List<ChargingBand>> bands = new HashMap<>();
        for (ParkingScheduleExceptionSlot slot : exceptionSlotRepository.findByExceptionIdInOrderByStartMinuteAsc(ids)) {
            bands.computeIfAbsent(slot.getExceptionId(), key -> new ArrayList<>()).add(slot.band());
        }
        return bands;
    }

    /**
     * The timetable as the calculator needs it, with exceptions loaded for the days that matter.
     *
     * <p>The date window is what keeps this bounded: a stay covers a few days and the "next band"
     * scan a fixed number, so neither grows with how many years of holidays the municipality has
     * recorded.</p>
     */
    @Transactional
    public ChargingSchedule scheduleFor(TenantId tenantId, Instant from, Instant to) {
        ParkingSchedule header = require(tenantId);
        ZoneId zone = zoneOf(tenantId);
        LocalDate first = from.atZone(zone).toLocalDate().minusDays(1);
        LocalDate last = to.atZone(zone).toLocalDate().plusDays(1);

        Map<DayOfWeek, List<ChargingBand>> weekly = new EnumMap<>(DayOfWeek.class);
        for (ParkingScheduleSlot slot : slotRepository.findByTenantIdOrderByWeekdayAscStartMinuteAsc(
                tenantId.value())) {
            weekly.computeIfAbsent(slot.weekday(), key -> new ArrayList<>()).add(slot.band());
        }

        List<ParkingScheduleException> exceptions = exceptionRepository
                .findByTenantIdAndExceptionDateBetweenOrderByExceptionDateAsc(tenantId.value(), first, last);
        Map<UUID, List<ChargingBand>> bandsByException = exceptionBands(exceptions);
        Map<LocalDate, ChargingDayRule> rules = new HashMap<>();
        for (ParkingScheduleException exception : exceptions) {
            rules.put(exception.getExceptionDate(), new ChargingDayRule(
                    exception.isCharges(),
                    exception.isChargesAllDay(),
                    bandsByException.getOrDefault(exception.getId(), List.of())));
        }
        return new ChargingSchedule(zone, header.isChargesAllDay(), weekly, rules);
    }

    /** How many minutes of {@code [from, to)} this municipality charges for. */
    @Transactional
    public int chargeableMinutes(TenantId tenantId, Instant from, Instant to) {
        return scheduleFor(tenantId, from, to).chargeableMinutes(from, to);
    }

    /**
     * When charging next resumes at or after {@code from} — what the app turns into "charging resumes
     * on Monday at 7:00". Empty when the municipality has no band within the lookahead.
     */
    @Transactional
    public Optional<Instant> nextChargingStart(TenantId tenantId, Instant from) {
        Instant horizon = from.plusSeconds((long) LOOKAHEAD_DAYS * 24L * 3600L);
        return scheduleFor(tenantId, from, horizon).nextChargingStart(from);
    }

    // --- write -----------------------------------------------------------------------------------

    /**
     * Replaces the whole timetable, as one form: the all-day switch, every band, every exception.
     *
     * <p>Wholesale and not a diff, for the same reason the parking policy is replaced wholesale: an
     * administrator edits a timetable as a single screen, and a partial update would leave the
     * question of what an absent band means unanswerable. Exceptions are a forward-looking calendar —
     * a stay that was already priced is not re-priced, so replacing them rewrites the plan, never the
     * record.</p>
     */
    @Transactional
    public ParkingSchedule replace(TenantId tenantId, boolean chargesAllDay, List<BandEntry> bands,
                                   List<ExceptionEntry> exceptions) {
        ValidationException.Collector errors = new ValidationException.Collector();
        List<BandEntry> validBands = new ArrayList<>();
        if (bands != null) {
            for (int index = 0; index < bands.size(); index++) {
                BandEntry entry = bands.get(index);
                if (entry == null || entry.weekday() == null) {
                    errors.add("bands[" + index + "].weekday", ErrorCode.VALIDATION_FAILED,
                            "error.parking.schedule.weekday.invalid");
                    continue;
                }
                if (!isValidBand(entry.startMinute(), entry.endMinute())) {
                    errors.add("bands[" + index + "]", ErrorCode.VALIDATION_FAILED,
                            "error.parking.schedule.band.invalid");
                    continue;
                }
                validBands.add(entry);
            }
        }
        if (!chargesAllDay && validBands.isEmpty() && (exceptions == null || exceptions.isEmpty())) {
            // A timetable with neither the all-day switch nor a single band charges nothing, ever.
            // That is legitimate configuration for a municipality that suspended charging, but it has
            // to be said with the switch off AND no bands deliberately, so it is only refused when it
            // arrives together with an obviously half-filled form.
            errors.add("bands", ErrorCode.VALIDATION_FAILED, "error.parking.schedule.bands.required");
        }

        List<ExceptionEntry> validExceptions = new ArrayList<>();
        Set<LocalDate> seenDates = new HashSet<>();
        if (exceptions != null) {
            if (exceptions.size() > MAX_EXCEPTIONS) {
                errors.add("exceptions", ErrorCode.VALIDATION_FAILED, "error.parking.schedule.exceptions.tooMany");
            }
            for (int index = 0; index < exceptions.size(); index++) {
                ExceptionEntry entry = exceptions.get(index);
                if (entry == null || entry.date() == null) {
                    errors.add("exceptions[" + index + "].date", ErrorCode.VALIDATION_FAILED,
                            "error.parking.schedule.exception.date.required");
                    continue;
                }
                if (!seenDates.add(entry.date())) {
                    errors.add("exceptions[" + index + "].date", ErrorCode.VALIDATION_FAILED,
                            "error.parking.schedule.exception.duplicate");
                    continue;
                }
                if (!entry.charges() && (entry.chargesAllDay() || !entry.bands().isEmpty())) {
                    // "We do not charge that day, on these hours" cannot mean anything.
                    errors.add("exceptions[" + index + "]", ErrorCode.VALIDATION_FAILED,
                            "error.parking.schedule.exception.incoherent");
                    continue;
                }
                boolean bandsValid = true;
                for (BandEntry band : entry.bands()) {
                    if (!isValidBand(band.startMinute(), band.endMinute())) {
                        errors.add("exceptions[" + index + "].bands", ErrorCode.VALIDATION_FAILED,
                                "error.parking.schedule.band.invalid");
                        bandsValid = false;
                        break;
                    }
                }
                if (bandsValid) {
                    validExceptions.add(entry);
                }
            }
        }
        errors.throwIfAny();

        Instant now = clock.instant();
        ParkingSchedule header = require(tenantId);
        header.replace(chargesAllDay, now);
        scheduleRepository.save(header);

        // Delete-then-insert: the timetable is a handful of rows replaced as one form, and the unique
        // indexes on (tenant, weekday, band) and (tenant, date) make an in-place diff order-sensitive.
        // Flushed one level at a time, children before parents: within a single persistence context
        // Hibernate orders its deletes by entity type, not by foreign key, so leaving all three to the
        // same flush would let an exception be deleted before its bands and turn a routine edit into a
        // constraint violation.
        exceptionSlotRepository.deleteByTenantId(tenantId.value());
        exceptionSlotRepository.flush();
        exceptionRepository.deleteByTenantId(tenantId.value());
        exceptionRepository.flush();
        slotRepository.deleteByTenantId(tenantId.value());
        slotRepository.flush();

        Set<String> writtenBands = new HashSet<>();
        for (BandEntry entry : validBands) {
            // Two identical bands on the same day would violate the unique index; they also mean the
            // same thing, so the second one is dropped rather than made into an error.
            if (writtenBands.add(entry.weekday().name() + ":" + entry.startMinute() + "-" + entry.endMinute())) {
                slotRepository.save(new ParkingScheduleSlot(Uuid7.generate(), tenantId.value(), entry.weekday(),
                        new ChargingBand(entry.startMinute(), entry.endMinute()), now));
            }
        }
        for (ExceptionEntry entry : validExceptions) {
            UUID exceptionId = Uuid7.generate();
            exceptionRepository.save(new ParkingScheduleException(exceptionId, tenantId.value(), entry.date(),
                    entry.charges(), entry.chargesAllDay(), trimmed(entry.label()), now));
            Set<String> writtenExceptionBands = new HashSet<>();
            for (BandEntry band : entry.bands()) {
                if (writtenExceptionBands.add(band.startMinute() + "-" + band.endMinute())) {
                    exceptionSlotRepository.save(new ParkingScheduleExceptionSlot(Uuid7.generate(),
                            tenantId.value(), exceptionId,
                            new ChargingBand(band.startMinute(), band.endMinute()), now));
                }
            }
        }
        return header;
    }

    /** The municipality's own zone; everything about a timetable is evaluated in it. */
    @Transactional(readOnly = true)
    public ZoneId zoneOf(TenantId tenantId) {
        Tenant tenant = tenantService.require(tenantId);
        return TimeZones.parse(tenant.getTimeZone()).orElse(ZoneId.of("UTC"));
    }

    private static boolean isValidBand(int startMinute, int endMinute) {
        return startMinute >= 0 && endMinute <= ChargingBand.MINUTES_PER_DAY && endMinute > startMinute;
    }

    private static String trimmed(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * One band of the form.
     *
     * @param weekday     the day it applies to; null on an exception's band, which belongs to a date
     * @param startMinute inclusive start, local minutes from midnight
     * @param endMinute   exclusive end, local minutes from midnight; 1440 closes the day
     */
    public record BandEntry(DayOfWeek weekday, int startMinute, int endMinute) {
    }

    /**
     * One dated exception of the form.
     *
     * @param date           the local date it applies to
     * @param charges        whether anything is charged that day; false is a holiday
     * @param chargesAllDay  whether the whole day is charged
     * @param label          tenant content naming the exception; never a translated label
     * @param bands          the day's own bands; empty means "as usual", i.e. the weekday bands
     */
    public record ExceptionEntry(LocalDate date, boolean charges, boolean chargesAllDay, String label,
                                 List<BandEntry> bands) {

        public ExceptionEntry {
            bands = bands == null ? List.of() : List.copyOf(bands);
        }
    }
}
