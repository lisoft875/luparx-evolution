package cr.luparx.app.web;

import cr.luparx.app.dashboard.DashboardService;
import cr.luparx.app.web.dto.DashboardDtos;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.money.Money;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;

/**
 * The municipal dashboard (CONTRACT.md v0.36).
 *
 * <p>One request and not nine. A dashboard assembled from nine calls renders in nine steps and each
 * of them can fail on its own, leaving a screen that is half true — which is worse than one that is
 * honestly still loading, because nobody can tell.</p>
 *
 * <p>Behind {@code AUDIT_READ}: the capability that already means "may see what this municipality
 * did", held by the administrator, the finance role and support. It is deliberately not
 * {@code TENANT_MANAGE} — reading the numbers is not the same authority as changing the
 * municipality's configuration, and a dashboard that only its administrator could open is a
 * dashboard nobody consults.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/dashboard")
@Tag(name = "Admin · Dashboard", description = "Everything the municipality can consult, in one read.")
public class AdminDashboardController {

    /**
     * A month.
     *
     * <p>Long enough that a quiet municipality's screen is not empty, short enough that the figures
     * are about now. Somebody who wants a quarter says so.</p>
     */
    private static final int DEFAULT_WINDOW_DAYS = 30;

    private final DashboardService dashboardService;
    private final TenantService tenantService;
    private final Clock clock;

    public AdminDashboardController(DashboardService dashboardService, TenantService tenantService,
                                    Clock clock) {
        this.dashboardService = dashboardService;
        this.tenantService = tenantService;
        this.clock = clock;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('PERM_AUDIT_READ')")
    @Operation(summary = "Revenue, transactions, stays, occupancy, checks, citations, exemptions, "
            + "officer activity and payment failures — in one read")
    public DashboardDtos.DashboardResponse dashboard(@RequestParam(required = false) Instant from,
                                                     @RequestParam(required = false) Instant to) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Tenant tenant = tenantService.requireActive(tenantId);
        Instant now = clock.instant();
        Instant start = from == null ? now.minus(DEFAULT_WINDOW_DAYS, ChronoUnit.DAYS) : from;
        Instant end = to == null ? now : to;

        DashboardService.Dashboard data = dashboardService.of(tenantId, start, end,
                tenant.getCurrencyCode(), now);
        return toResponse(data);
    }

    /**
     * El máximo de días que se sirven de una vez.
     *
     * <p>Un año. Alcanza para «este mes» y para comparar diciembres, y es el punto donde un gráfico
     * de barras deja de ser un gráfico y pasa a ser una mancha. Quien quiera más años pide un
     * reporte, que es la pantalla hecha para eso.</p>
     */
    private static final int MAX_SERIES_DAYS = 366;

    @GetMapping("/revenue-series")
    @PreAuthorize("hasAuthority('PERM_AUDIT_READ')")
    @Operation(summary = "Lo recaudado día por día, en la zona horaria de la municipalidad")
    public DashboardDtos.RevenueSeriesResponse revenueSeries(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Tenant tenant = tenantService.requireActive(tenantId);
        ZoneId zone = ZoneId.of(tenant.getTimeZone());

        // Fechas y no instantes: el cliente pide «del 17 al 23», que son días del calendario de la
        // municipalidad. Mandar instantes obligaría al navegador a calcular la medianoche de una zona
        // que no es la suya, y ese cálculo hecho en el cliente es de donde salen los gráficos corridos
        // un día.
        LocalDate hoy = LocalDate.ofInstant(clock.instant(), zone);
        LocalDate fin = to == null ? hoy : to;
        LocalDate inicio = from == null ? fin.minusDays(6L) : from;

        if (inicio.isAfter(fin)) {
            throw new ValidationException("from", ErrorCode.VALIDATION_FAILED, "error.range.inverted");
        }
        if (java.time.temporal.ChronoUnit.DAYS.between(inicio, fin) >= MAX_SERIES_DAYS) {
            throw new ValidationException("from", ErrorCode.VALIDATION_FAILED, "error.range.tooWide");
        }

        DashboardService.RevenueSeries serie =
                dashboardService.revenueSeries(tenantId, inicio, fin, zone, tenant.getCurrencyCode());
        return new DashboardDtos.RevenueSeriesResponse(
                serie.from(), serie.to(), serie.zone(),
                serie.days().stream()
                        .map(day -> new DashboardDtos.RevenueDayDto(day.date(), money(day.total()), day.count()))
                        .toList(),
                money(serie.total()));
    }

    private static DashboardDtos.DashboardResponse toResponse(DashboardService.Dashboard data) {
        return new DashboardDtos.DashboardResponse(
                data.from(), data.to(), data.now(),
                new DashboardDtos.RevenueBlock(
                        money(data.revenue().capturedGross()),
                        money(data.revenue().capturedNet()),
                        money(data.revenue().settledGross()),
                        money(data.revenue().unsettledGross()),
                        data.revenue().capturedCount()),
                data.transactions().stream()
                        .map(group -> new DashboardDtos.TransactionGroupDto(group.type(),
                                "wallet.transaction." + group.type().name().toLowerCase(java.util.Locale.ROOT),
                                group.count(), money(group.total())))
                        .toList(),
                data.parking().stream()
                        .map(group -> new DashboardDtos.ParkingGroupDto(group.paymentStatus(),
                                group.paymentStatus() == null
                                        ? "parking.payment.unknown"
                                        : "parking.payment." + group.paymentStatus().name()
                                                .toLowerCase(java.util.Locale.ROOT),
                                group.count(), money(group.total())))
                        .toList(),
                new DashboardDtos.OccupancyBlock(
                        data.occupancy().activeSessions(),
                        data.occupancy().unzonedActive(),
                        data.occupancy().zones().stream()
                                .map(zone -> new DashboardDtos.ZoneOccupancyDto(zone.zoneId(), zone.code(),
                                        zone.name(), zone.activeSessions(), zone.baysInService(),
                                        zone.percent()))
                                .toList()),
                data.checks().stream()
                        // El veredicto puede ser NULO y no es un caso raro: una consulta rechazada
                        // —sin señal, placa ilegible, fuera de zona— se guarda con su `refusalCode`
                        // y sin veredicto, porque no concluyó nada. Sin esta guarda el panel entero
                        // devolvía 500 en cuanto el período incluía una, y se llevaba también los
                        // KPIs del Inicio, que leen el mismo endpoint. El mapeo de estacionamientos,
                        // tres líneas más arriba, ya protegía su nulo; este no.
                        .map(group -> new DashboardDtos.VerdictGroupDto(group.verdict(),
                                verdictLabelKey(group.verdict()), group.count()))
                        .toList(),
                data.citations().stream()
                        .map(group -> new DashboardDtos.CitationGroupDto(group.status(),
                                group.status().labelKey(), group.count(), money(group.total())))
                        .toList(),
                data.exemptions().stream()
                        .map(group -> new DashboardDtos.ExemptionGroupDto(group.status(),
                                // The keys the exemptions screen already uses. Minting a parallel
                                // set would mean two vocabularies for one thing, and the day one is
                                // reworded the dashboard quietly disagrees with the screen it links to.
                                "admin.exemptions.status." + group.status().name(),
                                group.count()))
                        .toList(),
                data.inspectors().stream()
                        .map(row -> new DashboardDtos.InspectorActivityDto(row.inspectorUserId(), row.name(),
                                row.checks(), row.citations(), row.lastCheckAt()))
                        .toList(),
                new DashboardDtos.PaymentFailuresBlock(
                        data.paymentFailures().count(),
                        money(data.paymentFailures().amount()),
                        data.paymentFailures().byReason().stream()
                                .map(group -> new DashboardDtos.FailureGroupDto(group.code(), group.reason(),
                                        group.count(), money(group.amount())))
                                .toList()));
    }

    /** Null stays null, as everywhere: an absent amount is not an amount of zero. */
    /**
     * La etiqueta de un veredicto, incluido el caso en que no hay veredicto.
     *
     * <p>El veredicto es NULO y no es un caso raro: una consulta rechazada —sin señal, placa
     * ilegible, bahía fuera de zona— se guarda con su código de rechazo y sin veredicto, porque no
     * concluyó nada. La columna es nullable justamente para poder decir eso.</p>
     *
     * <p>Sin esta guarda el panel devolvía <b>500</b> en cuanto el período incluía una de esas, y se
     * llevaba también los KPIs del Inicio, que leen el mismo endpoint. El mapeo de estacionamientos,
     * unas líneas más arriba, ya protegía su nulo desde el principio; éste nunca lo hizo, y el fallo
     * esperó a que alguien rechazara una consulta para aparecer.</p>
     *
     * <p>Método aparte —y no un ternario dentro del `map`— para poder probarlo: la regla que hay que
     * dejar escrita es que un veredicto ausente tiene nombre, no que este `stream` esté bien.</p>
     */
    static String verdictLabelKey(cr.luparx.enforcement.model.PlateVerdict verdict) {
        return verdict == null ? "plate.verdict.unknown" : verdict.labelKey();
    }

    private static ParkingDtos.MoneyDto money(Money amount) {
        return amount == null ? null : new ParkingDtos.MoneyDto(amount.minorUnits(), amount.currencyCode());
    }
}
