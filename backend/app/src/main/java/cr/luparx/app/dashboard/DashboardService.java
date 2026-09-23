package cr.luparx.app.dashboard;

import cr.luparx.billing.model.PaymentState;
import cr.luparx.billing.repository.PaymentRepository;
import cr.luparx.billing.service.PaymentService;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.money.Money;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.ExemptionStatus;
import cr.luparx.enforcement.model.PlateVerdict;
import cr.luparx.enforcement.repository.CitationRepository;
import cr.luparx.enforcement.repository.EnforcementCheckRepository;
import cr.luparx.enforcement.repository.PlateExemptionRepository;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.service.UserDirectoryService;
import cr.luparx.parking.entity.ParkingZone;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.model.ParkingSpaceStatus;
import cr.luparx.parking.model.PaymentStatus;
import cr.luparx.parking.model.WalletTransactionType;
import cr.luparx.parking.repository.ParkingSessionRepository;
import cr.luparx.parking.repository.ParkingSpaceRepository;
import cr.luparx.parking.repository.ParkingZoneRepository;
import cr.luparx.parking.repository.WalletTransactionRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * The municipal dashboard (CONTRACT.md v0.36).
 *
 * <h2>«No solamente estadísticas bonitas»</h2>
 *
 * <p>Every figure this produces is a count of rows somebody can go and read. Nothing here is a
 * derived index, a score, or a trend line drawn through three points — the sort of number that looks
 * like insight and cannot be checked. The client turns each one into a link to the screen that lists
 * exactly those rows, which is what makes a dashboard something a municipality can <em>consult</em>
 * rather than something it can only look at.</p>
 *
 * <h2>Dos relojes, separados a propósito</h2>
 *
 * <p>Some of what the checklist asks for is <b>now</b> — running stays, occupancy — and the rest is
 * <b>a period</b>. Mixing them is how a screen ends up saying "142 stays" next to "₡340.000
 * collected" where the two numbers count different things and nobody notices. They are returned in
 * separate blocks, each with the moment or the window it refers to.</p>
 *
 * <h2>Por qué vive en el app</h2>
 *
 * <p>It reads across five bounded contexts, which nothing inside a module is allowed to do. A read
 * model that spans contexts belongs at the composition root: no module gains a dependency it would
 * have to be untangled from later, and the day one of them is extracted this class becomes the place
 * where a remote call replaces a repository — which is a change to one file rather than a rewrite.</p>
 */
@Service
public class DashboardService {

    /** Officers listed. Enough for a municipality's shift, and not a page nobody scrolls. */
    private static final int MAX_INSPECTORS = 25;

    /** Distinct failure reasons listed. Beyond this it is noise, and the tail is in the payments screen. */
    private static final int MAX_FAILURE_CODES = 10;

    private final PaymentService paymentService;
    private final PaymentRepository paymentRepository;
    private final ParkingSessionRepository sessionRepository;
    private final ParkingSpaceRepository spaceRepository;
    private final ParkingZoneRepository zoneRepository;
    private final WalletTransactionRepository walletTransactionRepository;
    private final EnforcementCheckRepository checkRepository;
    private final CitationRepository citationRepository;
    private final PlateExemptionRepository exemptionRepository;
    private final UserDirectoryService userDirectoryService;

    public DashboardService(PaymentService paymentService,
                            PaymentRepository paymentRepository,
                            ParkingSessionRepository sessionRepository,
                            ParkingSpaceRepository spaceRepository,
                            ParkingZoneRepository zoneRepository,
                            WalletTransactionRepository walletTransactionRepository,
                            EnforcementCheckRepository checkRepository,
                            CitationRepository citationRepository,
                            PlateExemptionRepository exemptionRepository,
                            UserDirectoryService userDirectoryService) {
        this.paymentService = paymentService;
        this.paymentRepository = paymentRepository;
        this.sessionRepository = sessionRepository;
        this.spaceRepository = spaceRepository;
        this.zoneRepository = zoneRepository;
        this.walletTransactionRepository = walletTransactionRepository;
        this.checkRepository = checkRepository;
        this.citationRepository = citationRepository;
        this.exemptionRepository = exemptionRepository;
        this.userDirectoryService = userDirectoryService;
    }

    /**
     * The nine things the checklist asks for, in one read.
     *
     * <p>One call and not nine, because a dashboard that fires nine requests renders in nine steps
     * and each of them can fail on its own — leaving a screen that is half true, which is worse than
     * one that is honestly still loading.</p>
     */
    @Transactional(readOnly = true)
    public Dashboard of(TenantId tenantId, Instant from, Instant to, String currencyCode, Instant now) {
        return new Dashboard(
                from, to, now, currencyCode,
                revenue(tenantId, from, to, currencyCode),
                transactions(tenantId, from, to, currencyCode),
                parking(tenantId, from, to, currencyCode),
                occupancy(tenantId),
                checks(tenantId, from, to),
                citations(tenantId, from, to, currencyCode),
                exemptions(tenantId),
                inspectors(tenantId, from, to),
                paymentFailures(tenantId, from, to, currencyCode));
    }

    /**
     * Lo recaudado día por día, con los días vacíos escritos como cero.
     *
     * <h2>El cero tiene que estar</h2>
     *
     * <p>La consulta sólo devuelve los días que tuvieron algo. Dibujar eso tal cual daría un gráfico
     * de siete barras donde el domingo sin ventas simplemente no aparece, y el ojo lee eso como
     * «faltan datos» o, peor, corre las fechas y hace ver el lunes donde va el martes. Un día sin
     * recaudación es un hecho —la municipalidad no cobró— y se escribe como tal.</p>
     *
     * <h2>El día es el del reloj de la municipalidad</h2>
     *
     * <p>Los límites se calculan en su zona horaria, no en UTC: el «hoy» de San José empieza a las
     * 06:00Z, y agrupar en UTC le pasaría la venta de las 7 p.m. al día siguiente.</p>
     */
    @Transactional(readOnly = true)
    public RevenueSeries revenueSeries(TenantId tenantId, LocalDate from, LocalDate to, ZoneId zone,
                                       String currencyCode) {
        Map<LocalDate, long[]> porDia = new HashMap<>();
        for (Object[] row : paymentRepository.capturedByDay(tenantId.value(),
                DailyBuckets.startOf(from, zone), DailyBuckets.endOf(to, zone), zone.getId())) {
            porDia.put(asLocalDate(row[0]), new long[] {
                    ((Number) row[1]).longValue(),
                    ((Number) row[2]).longValue() });
        }

        List<RevenueDay> days = DailyBuckets.fill(from, to, porDia, currencyCode);
        long total = 0L;
        for (RevenueDay day : days) {
            total += day.total().minorUnits();
        }
        return new RevenueSeries(from, to, zone.getId(), days, Money.ofMinor(total, currencyCode));
    }

    /**
     * La fecha de una consulta nativa, venga como venga.
     *
     * <p>Hibernate devuelve {@code LocalDate} para una columna {@code date}, pero un driver o una
     * versión distinta puede entregar {@code java.sql.Date}. Costó descubrirlo una vez; no vale la
     * pena que cueste dos.</p>
     */
    private static LocalDate asLocalDate(Object value) {
        if (value instanceof LocalDate date) {
            return date;
        }
        if (value instanceof java.sql.Date date) {
            return date.toLocalDate();
        }
        return LocalDate.parse(String.valueOf(value));
    }

    // --- 1. recaudación ----------------------------------------------------------------------------

    private Revenue revenue(TenantId tenantId, Instant from, Instant to, String currencyCode) {
        PaymentService.Totals totals = paymentService.totals(tenantId, from, to, currencyCode);
        return new Revenue(totals.capturedGross(), totals.capturedNet(), totals.settledGross(),
                totals.unsettledGross(), totals.capturedCount());
    }

    // --- 2. transacciones --------------------------------------------------------------------------

    private List<TransactionGroup> transactions(TenantId tenantId, Instant from, Instant to,
                                                String currencyCode) {
        List<TransactionGroup> groups = new ArrayList<>();
        for (Object[] row : walletTransactionRepository.countByType(tenantId.value(), from, to)) {
            groups.add(new TransactionGroup((WalletTransactionType) row[0], ((Number) row[1]).longValue(),
                    // Signed: a charge is negative in this ledger. Summing absolute values to reach a
                    // bigger number is the first lie a financial dashboard tells.
                    Money.ofMinor(((Number) row[2]).longValue(), currencyCode)));
        }
        groups.sort(Comparator.comparing(group -> group.type().name()));
        return groups;
    }

    // --- 3. estacionamientos, por cómo se pagaron --------------------------------------------------

    private List<ParkingGroup> parking(TenantId tenantId, Instant from, Instant to, String currencyCode) {
        List<ParkingGroup> groups = new ArrayList<>();
        for (Object[] row : sessionRepository.countByPaymentStatus(tenantId.value(), from, to)) {
            groups.add(new ParkingGroup((PaymentStatus) row[0], ((Number) row[1]).longValue(),
                    Money.ofMinor(((Number) row[2]).longValue(), currencyCode)));
        }
        return groups;
    }

    // --- 4. ocupación por zona ---------------------------------------------------------------------

    /**
     * Occupancy, right now, and stated so that it cannot be read as more than it is.
     *
     * <p>Numerator: stays running this second. Denominator: bays <b>in service</b> — a bay closed for
     * roadworks is not capacity, and counting it would report a municipality as emptier than it is on
     * exactly the week it is most congested.</p>
     *
     * <p>A zone with no numbered bays has <b>no percentage</b>, not zero per cent. Plenty of
     * municipalities charge by sector without painting numbers, and printing 0% for them would be a
     * figure that is wrong rather than absent. Stays outside every zone are reported apart instead of
     * dropped: a car parked somewhere is still a car parked somewhere.</p>
     */
    private Occupancy occupancy(TenantId tenantId) {
        Map<UUID, Long> active = new HashMap<>();
        long unzoned = 0L;
        for (Object[] row : sessionRepository.countActiveByZone(tenantId.value(), ParkingSessionStatus.ACTIVE)) {
            long count = ((Number) row[1]).longValue();
            if (row[0] == null) {
                unzoned += count;
            } else {
                active.put((UUID) row[0], count);
            }
        }
        Map<UUID, Long> capacity = new HashMap<>();
        for (Object[] row : spaceRepository.countInServiceByZone(tenantId.value(), ParkingSpaceStatus.AVAILABLE)) {
            if (row[0] != null) {
                capacity.put((UUID) row[0], ((Number) row[1]).longValue());
            }
        }

        List<ZoneOccupancy> zones = new ArrayList<>();
        long totalActive = unzoned;
        for (ParkingZone zone : zoneRepository.findByTenantIdOrderByCodeAsc(tenantId.value())) {
            long running = active.getOrDefault(zone.getId(), 0L);
            Long bays = capacity.get(zone.getId());
            totalActive += running;
            zones.add(new ZoneOccupancy(zone.getId(), zone.getCode(), zone.getName(), running,
                    bays == null ? 0L : bays.longValue(),
                    bays == null || bays.longValue() == 0L
                            ? null
                            : Integer.valueOf((int) Math.round(running * 100.0 / bays.longValue()))));
        }
        // Busiest first: a list ordered by code buries the zone somebody has to do something about.
        zones.sort(Comparator.comparingLong(ZoneOccupancy::activeSessions).reversed());
        return new Occupancy(totalActive, unzoned, zones);
    }

    // --- 5. fiscalizaciones ------------------------------------------------------------------------

    private List<VerdictGroup> checks(TenantId tenantId, Instant from, Instant to) {
        List<VerdictGroup> groups = new ArrayList<>();
        for (Object[] row : checkRepository.countByVerdict(tenantId.value(), from, to)) {
            groups.add(new VerdictGroup((PlateVerdict) row[0], ((Number) row[1]).longValue()));
        }
        groups.sort(Comparator.comparingLong(VerdictGroup::count).reversed());
        return groups;
    }

    // --- 6. infracciones ---------------------------------------------------------------------------

    private List<CitationGroup> citations(TenantId tenantId, Instant from, Instant to, String currencyCode) {
        List<CitationGroup> groups = new ArrayList<>();
        for (Object[] row : citationRepository.countByStatusIn(tenantId.value(), from, to)) {
            groups.add(new CitationGroup((CitationStatus) row[0], ((Number) row[1]).longValue(),
                    Money.ofMinor(((Number) row[2]).longValue(), currencyCode)));
        }
        return groups;
    }

    // --- 7. exoneraciones --------------------------------------------------------------------------

    private List<ExemptionGroup> exemptions(TenantId tenantId) {
        List<ExemptionGroup> groups = new ArrayList<>();
        for (Object[] row : exemptionRepository.countByStatusGrouped(tenantId.value())) {
            groups.add(new ExemptionGroup((ExemptionStatus) row[0], ((Number) row[1]).longValue()));
        }
        return groups;
    }

    // --- 8. actividad por inspector ----------------------------------------------------------------

    /**
     * What each officer did, with their name on it.
     *
     * <p>Lookups and citations side by side, because either alone is misleading in a way a supervisor
     * will act on: an officer with many lookups and no citations may be doing the job perfectly in a
     * compliant sector, and one with citations and almost no lookups is writing them without
     * checking. The two numbers together are a question worth asking; each one alone is an accusation
     * or a commendation nobody has earned.</p>
     *
     * <p>Names are resolved in one query for the whole list, the same way the audit trail does it and
     * for the same reason (v0.33). An officer who has left still appears with their name: their work
     * that week happened.</p>
     */
    private List<InspectorActivity> inspectors(TenantId tenantId, Instant from, Instant to) {
        List<Object[]> lookups = checkRepository.countByInspector(tenantId.value(), from, to,
                PageRequest.of(0, MAX_INSPECTORS));
        Map<UUID, Long> citationCounts = new HashMap<>();
        for (Object[] row : citationRepository.countByInspector(tenantId.value(), from, to)) {
            citationCounts.put((UUID) row[0], ((Number) row[1]).longValue());
        }

        Set<UUID> ids = new HashSet<>();
        for (Object[] row : lookups) {
            if (row[0] != null) {
                ids.add((UUID) row[0]);
            }
        }
        ids.addAll(citationCounts.keySet());
        Map<UUID, String> names = new HashMap<>();
        for (User person : userDirectoryService.findAllById(ids)) {
            names.put(person.getId(), person.displayName());
        }

        Map<UUID, InspectorActivity> byInspector = new LinkedHashMap<>();
        for (Object[] row : lookups) {
            UUID id = (UUID) row[0];
            if (id == null) {
                continue;
            }
            byInspector.put(id, new InspectorActivity(id, names.get(id), ((Number) row[1]).longValue(),
                    citationCounts.getOrDefault(id, 0L), (Instant) row[2]));
        }
        // Officers who wrote citations without a single lookup in the window. They are exactly who a
        // supervisor wants to see, so leaving them out because they are absent from the first query
        // would remove the most interesting row on the list.
        for (Map.Entry<UUID, Long> entry : citationCounts.entrySet()) {
            byInspector.computeIfAbsent(entry.getKey(),
                    id -> new InspectorActivity(id, names.get(id), 0L, entry.getValue(), null));
        }
        return List.copyOf(byInspector.values());
    }

    // --- 9. fallos de pago -------------------------------------------------------------------------

    private PaymentFailures paymentFailures(TenantId tenantId, Instant from, Instant to, String currencyCode) {
        List<FailureGroup> groups = new ArrayList<>();
        long total = 0L;
        long amount = 0L;
        for (Object[] row : paymentRepository.countFailuresByCode(tenantId.value(),
                List.of(PaymentState.FAILED, PaymentState.CANCELLED), from, to,
                PageRequest.of(0, MAX_FAILURE_CODES))) {
            long count = ((Number) row[2]).longValue();
            long value = ((Number) row[3]).longValue();
            total += count;
            amount += value;
            groups.add(new FailureGroup((String) row[0], (String) row[1], count,
                    Money.ofMinor(value, currencyCode)));
        }
        return new PaymentFailures(total, Money.ofMinor(amount, currencyCode), groups);
    }

    // --- what comes back ---------------------------------------------------------------------------

    /**
     * @param now the moment the "right now" blocks refer to. Sent so the screen can say it: a figure
     *            that is live and a figure that covers a month must not look alike
     */
    public record Dashboard(Instant from, Instant to, Instant now, String currencyCode,
                            Revenue revenue, List<TransactionGroup> transactions,
                            List<ParkingGroup> parking, Occupancy occupancy,
                            List<VerdictGroup> checks, List<CitationGroup> citations,
                            List<ExemptionGroup> exemptions, List<InspectorActivity> inspectors,
                            PaymentFailures paymentFailures) {
    }

    public record Revenue(Money capturedGross, Money capturedNet, Money settledGross, Money unsettledGross,
                          long capturedCount) {
    }

    public record TransactionGroup(WalletTransactionType type, long count, Money total) {
    }

    /**
     * @param zone la zona horaria con la que se cortaron los días, dicha en voz alta para que nadie
     *             tenga que suponer de qué calendario son esas fechas
     */
    public record RevenueSeries(LocalDate from, LocalDate to, String zone, List<RevenueDay> days,
                                Money total) {
    }

    /** @param count cuántos pagos, no cuántas estadías: un pago puede cubrir más de una. */
    public record RevenueDay(LocalDate date, Money total, long count) {
    }

    public record ParkingGroup(PaymentStatus paymentStatus, long count, Money total) {
    }

    /** @param unzonedActive stays running outside every zone. Reported, never folded away. */
    public record Occupancy(long activeSessions, long unzonedActive, List<ZoneOccupancy> zones) {
    }

    /** @param percent null when the zone has no numbered bays — absent, which is not the same as 0%. */
    public record ZoneOccupancy(UUID zoneId, String code, String name, long activeSessions,
                                long baysInService, Integer percent) {
    }

    public record VerdictGroup(PlateVerdict verdict, long count) {
    }

    public record CitationGroup(CitationStatus status, long count, Money total) {
    }

    public record ExemptionGroup(ExemptionStatus status, long count) {
    }

    /** @param lastCheckAt null for an officer who wrote citations and looked nothing up in the window. */
    public record InspectorActivity(UUID inspectorUserId, String name, long checks, long citations,
                                    Instant lastCheckAt) {
    }

    public record PaymentFailures(long count, Money amount, List<FailureGroup> byReason) {
    }

    /** @param code the provider's own code, kept verbatim — it is what a claim is made with. */
    public record FailureGroup(String code, String reason, long count, Money amount) {
    }
}
