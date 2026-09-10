package cr.luparx.parking.service;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.i18n.TimeZones;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.time.HolidayObservance;
import cr.luparx.parking.entity.ParkingSchedule;
import cr.luparx.parking.entity.ParkingScheduleException;
import cr.luparx.parking.entity.ParkingScheduleExceptionSlot;
import cr.luparx.parking.entity.ParkingScheduleSlot;
import cr.luparx.parking.entity.ParkingZoneSchedule;
import cr.luparx.parking.entity.ParkingZoneScheduleSlot;
import cr.luparx.parking.model.ChargingBand;
import cr.luparx.parking.model.ChargingDayRule;
import cr.luparx.parking.model.ChargingSchedule;
import cr.luparx.parking.model.ExceptionRecurrence;
import cr.luparx.parking.model.ParkingScheduleDefaults;
import cr.luparx.parking.repository.ParkingScheduleExceptionRepository;
import cr.luparx.parking.repository.ParkingScheduleExceptionSlotRepository;
import cr.luparx.parking.repository.ParkingScheduleRepository;
import cr.luparx.parking.repository.ParkingScheduleSlotRepository;
import cr.luparx.parking.repository.ParkingZoneScheduleRepository;
import cr.luparx.parking.repository.ParkingZoneScheduleSlotRepository;
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

    /**
     * How many <b>recurring</b> rules one municipality may keep.
     *
     * <p>Its own limit and a much smaller one, because these are the rows the pricing path loads in
     * full every time it prices a stay: a recurring rule has no date to filter on, so it is expanded
     * in memory against the window. A country has a dozen holidays; sixty is generous and still
     * nothing to load.</p>
     */
    private static final int MAX_RECURRING_EXCEPTIONS = 60;

    private final ParkingScheduleRepository scheduleRepository;
    private final ParkingScheduleSlotRepository slotRepository;
    private final ParkingScheduleExceptionRepository exceptionRepository;
    private final ParkingScheduleExceptionSlotRepository exceptionSlotRepository;
    private final ParkingZoneScheduleRepository zoneScheduleRepository;
    private final ParkingZoneScheduleSlotRepository zoneSlotRepository;
    private final ParkingScheduleDefaults defaults;
    private final TenantService tenantService;
    private final Clock clock;

    public ParkingScheduleService(ParkingScheduleRepository scheduleRepository,
                                  ParkingScheduleSlotRepository slotRepository,
                                  ParkingScheduleExceptionRepository exceptionRepository,
                                  ParkingScheduleExceptionSlotRepository exceptionSlotRepository,
                                  ParkingZoneScheduleRepository zoneScheduleRepository,
                                  ParkingZoneScheduleSlotRepository zoneSlotRepository,
                                  ParkingScheduleDefaults defaults,
                                  TenantService tenantService,
                                  Clock clock) {
        this.scheduleRepository = scheduleRepository;
        this.slotRepository = slotRepository;
        this.exceptionRepository = exceptionRepository;
        this.exceptionSlotRepository = exceptionSlotRepository;
        this.zoneScheduleRepository = zoneScheduleRepository;
        this.zoneSlotRepository = zoneSlotRepository;
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
        return exceptionRepository.findAllForTenant(tenantId.value());
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
        return scheduleFor(tenantId, null, from, to);
    }

    /**
     * The timetable that applies in one zone.
     *
     * <p>The <b>weekly bands</b> are the zone's when it keeps its own, and the municipality's
     * otherwise; the existence of the zone's header row is what decides, because a timetable is not
     * inherited by halves. A zone header with no band at all is a zone that never charges — a free
     * zone, which could not be expressed before v0.31 and is told apart from "inherits" precisely
     * because the row exists.</p>
     *
     * <p>The <b>dated exceptions are always the municipality's</b>. A public holiday is a holiday
     * across the whole canton: a zone may charge on hours of its own every day of the week, but the
     * 15th of September is not charged anywhere, and giving each zone its own holidays would multiply
     * per zone exactly the work v0.31 exists to remove.</p>
     *
     * @param zoneId the zone, or null for the municipality's own timetable
     */
    @Transactional
    public ChargingSchedule scheduleFor(TenantId tenantId, UUID zoneId, Instant from, Instant to) {
        ParkingSchedule header = require(tenantId);
        ZoneId zone = zoneOf(tenantId);
        LocalDate first = from.atZone(zone).toLocalDate().minusDays(1);
        LocalDate last = to.atZone(zone).toLocalDate().plusDays(1);

        ParkingZoneSchedule zoneHeader = zoneId == null
                ? null
                : zoneScheduleRepository.findByTenantIdAndZoneId(tenantId.value(), zoneId).orElse(null);

        Map<DayOfWeek, List<ChargingBand>> weekly = new EnumMap<>(DayOfWeek.class);
        boolean chargesAllDay;
        if (zoneHeader != null) {
            chargesAllDay = zoneHeader.isChargesAllDay();
            for (ParkingZoneScheduleSlot slot : zoneSlotRepository
                    .findByZoneIdOrderByWeekdayAscStartMinuteAsc(zoneId)) {
                weekly.computeIfAbsent(slot.weekday(), key -> new ArrayList<>()).add(slot.band());
            }
        } else {
            chargesAllDay = header.isChargesAllDay();
            for (ParkingScheduleSlot slot : slotRepository.findByTenantIdOrderByWeekdayAscStartMinuteAsc(
                    tenantId.value())) {
                weekly.computeIfAbsent(slot.weekday(), key -> new ArrayList<>()).add(slot.band());
            }
        }

        return new ChargingSchedule(zone, chargesAllDay, weekly, dayRules(tenantId, first, last));
    }

    /**
     * The municipality's exceptions expanded onto the concrete dates of {@code [first, last]}.
     *
     * <p>A recurring rule can land on a date another rule already claimed — a fixed holiday that
     * happens to fall on Easter Monday, or a one-off the municipality wrote for a date its annual
     * rule also covers. <b>The one-off wins</b>, and that is the only ordering rule here: a date
     * somebody typed on purpose is more specific than a rule that also happens to produce it, which
     * is a fact about the two rows rather than a preference anybody set. It is the same argument the
     * price ladder settles ties with (CONTRACT.md v0.24).</p>
     */
    private Map<LocalDate, ChargingDayRule> dayRules(TenantId tenantId, LocalDate first, LocalDate last) {
        List<ParkingScheduleException> exceptions = exceptionRepository.findForWindow(
                tenantId.value(), ExceptionRecurrence.Kind.ONCE, first, last);
        Map<UUID, List<ChargingBand>> bandsByException = exceptionBands(exceptions);
        Map<LocalDate, ChargingDayRule> rules = new HashMap<>();
        // Recurring first, then the dated ones over them: last write wins, and the dated ones are last.
        for (ParkingScheduleException exception : exceptions) {
            if (exception.getRecurrence() == ExceptionRecurrence.Kind.ONCE) {
                continue;
            }
            ChargingDayRule rule = ruleOf(exception, bandsByException);
            for (LocalDate date : exception.recurrence().datesIn(first, last)) {
                rules.put(date, rule);
            }
        }
        for (ParkingScheduleException exception : exceptions) {
            if (exception.getRecurrence() != ExceptionRecurrence.Kind.ONCE
                    || exception.getExceptionDate() == null) {
                continue;
            }
            rules.put(exception.getExceptionDate(), ruleOf(exception, bandsByException));
        }
        return rules;
    }

    private static ChargingDayRule ruleOf(ParkingScheduleException exception,
                                          Map<UUID, List<ChargingBand>> bandsByException) {
        return new ChargingDayRule(exception.isCharges(), exception.isChargesAllDay(),
                bandsByException.getOrDefault(exception.getId(), List.of()));
    }

    /** How many minutes of {@code [from, to)} this municipality charges for. */
    @Transactional
    public int chargeableMinutes(TenantId tenantId, Instant from, Instant to) {
        return chargeableMinutes(tenantId, null, from, to);
    }

    /** The same, in one zone: its own hours when it keeps them, the municipality's otherwise. */
    @Transactional
    public int chargeableMinutes(TenantId tenantId, UUID zoneId, Instant from, Instant to) {
        return scheduleFor(tenantId, zoneId, from, to).chargeableMinutes(from, to);
    }

    /**
     * When charging next resumes at or after {@code from} — what the app turns into "charging resumes
     * on Monday at 7:00". Empty when the municipality has no band within the lookahead.
     */
    @Transactional
    public Optional<Instant> nextChargingStart(TenantId tenantId, Instant from) {
        return nextChargingStart(tenantId, null, from);
    }

    /** The same, in one zone. What the app turns into "charging resumes on Monday at 7:00". */
    @Transactional
    public Optional<Instant> nextChargingStart(TenantId tenantId, UUID zoneId, Instant from) {
        Instant horizon = from.plusSeconds((long) LOOKAHEAD_DAYS * 24L * 3600L);
        return scheduleFor(tenantId, zoneId, from, horizon).nextChargingStart(from);
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
        Set<String> seenKeys = new HashSet<>();
        int recurring = 0;
        if (exceptions != null) {
            if (exceptions.size() > MAX_EXCEPTIONS) {
                errors.add("exceptions", ErrorCode.VALIDATION_FAILED, "error.parking.schedule.exceptions.tooMany");
            }
            for (int index = 0; index < exceptions.size(); index++) {
                ExceptionEntry entry = exceptions.get(index);
                if (entry == null || entry.recurrence() == null || !isCoherent(entry.recurrence())) {
                    errors.add("exceptions[" + index + "].date", ErrorCode.VALIDATION_FAILED,
                            "error.parking.schedule.exception.date.required");
                    continue;
                }
                if (entry.recurrence().kind() != ExceptionRecurrence.Kind.ONCE) {
                    recurring++;
                }
                // Two rules that describe the same day are one rule written twice, and the partial
                // unique indexes would refuse the second anyway. The key is per shape: a one-off on
                // the 15th and an annual on the 15th are different rows and both are legitimate.
                if (!seenKeys.add(keyOf(entry.recurrence()))) {
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
            if (recurring > MAX_RECURRING_EXCEPTIONS) {
                // Its own limit, because these are the rows the pricing path loads in full every time.
                errors.add("exceptions", ErrorCode.VALIDATION_FAILED,
                        "error.parking.schedule.exceptions.tooManyRecurring");
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
            exceptionRepository.save(new ParkingScheduleException(exceptionId, tenantId.value(),
                    entry.recurrence(), entry.charges(), entry.chargesAllDay(), trimmed(entry.label()),
                    trimmed(entry.holidayCode()), now));
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

    // --- a zone's own timetable (CONTRACT.md v0.31) ------------------------------------------------

    /** The zone's own timetable header, or empty when it follows the municipality's. */
    @Transactional(readOnly = true)
    public Optional<ParkingZoneSchedule> zoneSchedule(TenantId tenantId, UUID zoneId) {
        return zoneScheduleRepository.findByTenantIdAndZoneId(tenantId.value(), zoneId);
    }

    /** The zone's own bands. Empty either because it follows the municipality or because it is free. */
    @Transactional(readOnly = true)
    public List<ParkingZoneScheduleSlot> zoneSlots(UUID zoneId) {
        return zoneSlotRepository.findByZoneIdOrderByWeekdayAscStartMinuteAsc(zoneId);
    }

    /**
     * Gives a zone its own timetable, or takes it away.
     *
     * <p>{@code own = false} deletes the header and its bands, and the zone goes back to following
     * the municipality — including any change the municipality makes afterwards, which is the whole
     * reason this is a deletion and not a copy of the municipality's bands into the zone.</p>
     *
     * <p>{@code own = true} with the all-day switch off and no band is a zone that <b>never
     * charges</b>. It is accepted deliberately: a free zone is real configuration, and it is only
     * expressible because the header row exists to say "this zone decided", which is exactly what
     * tells it apart from a zone that inherits.</p>
     */
    @Transactional
    public Optional<ParkingZoneSchedule> replaceZone(TenantId tenantId, UUID zoneId, boolean own,
                                                     boolean chargesAllDay, List<BandEntry> bands) {
        Instant now = clock.instant();
        if (!own) {
            zoneSlotRepository.deleteByZoneId(zoneId);
            zoneSlotRepository.flush();
            zoneScheduleRepository.findByTenantIdAndZoneId(tenantId.value(), zoneId)
                    .ifPresent(zoneScheduleRepository::delete);
            return Optional.empty();
        }

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
        errors.throwIfAny();

        ParkingZoneSchedule header = zoneScheduleRepository.findByTenantIdAndZoneId(tenantId.value(), zoneId)
                .orElseGet(() -> new ParkingZoneSchedule(zoneId, tenantId.value(), chargesAllDay, now));
        header.replace(chargesAllDay, now);
        zoneScheduleRepository.save(header);
        zoneScheduleRepository.flush();

        zoneSlotRepository.deleteByZoneId(zoneId);
        zoneSlotRepository.flush();
        Set<String> written = new HashSet<>();
        for (BandEntry entry : validBands) {
            if (written.add(entry.weekday().name() + ":" + entry.startMinute() + "-" + entry.endMinute())) {
                zoneSlotRepository.save(new ParkingZoneScheduleSlot(Uuid7.generate(), zoneId, tenantId.value(),
                        entry.weekday(), new ChargingBand(entry.startMinute(), entry.endMinute()), now));
            }
        }
        return Optional.of(header);
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

    /** Each shape of rule carries exactly its own data; the database says the same in a CHECK. */
    private static boolean isCoherent(ExceptionRecurrence recurrence) {
        return switch (recurrence.kind()) {
            case ONCE -> recurrence.date() != null;
            case ANNUAL -> recurrence.month() != null && recurrence.day() != null
                    && recurrence.month() >= 1 && recurrence.month() <= 12
                    && recurrence.day() >= 1 && recurrence.day() <= 31;
            case EASTER -> recurrence.easterOffsetDays() != null
                    && recurrence.easterOffsetDays() >= -180 && recurrence.easterOffsetDays() <= 180;
        };
    }

    private static String keyOf(ExceptionRecurrence recurrence) {
        return switch (recurrence.kind()) {
            case ONCE -> "ONCE:" + recurrence.date();
            case ANNUAL -> "ANNUAL:" + recurrence.month() + "-" + recurrence.day();
            case EASTER -> "EASTER:" + recurrence.easterOffsetDays();
        };
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
     * One exception of the form.
     *
     * @param recurrence     when it falls: one date, a day of the year, or a distance from Easter
     * @param charges        whether anything is charged that day; false is a holiday
     * @param chargesAllDay  whether the whole day is charged
     * @param label          tenant content naming the exception; never a translated label
     * @param holidayCode    which catalogue entry it was copied from, when it was; provenance only
     * @param bands          the day's own bands; empty means "as usual", i.e. the weekday bands
     */
    public record ExceptionEntry(ExceptionRecurrence recurrence, boolean charges, boolean chargesAllDay,
                                 String label, String holidayCode, List<BandEntry> bands) {

        public ExceptionEntry {
            bands = bands == null ? List.of() : List.copyOf(bands);
        }
    }
}
