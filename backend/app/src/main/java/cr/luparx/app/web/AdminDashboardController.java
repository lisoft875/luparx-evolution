package cr.luparx.app.web;

import cr.luparx.app.dashboard.DashboardService;
import cr.luparx.app.web.dto.DashboardDtos;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.money.Money;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.Instant;
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
                        .map(group -> new DashboardDtos.VerdictGroupDto(group.verdict(),
                                group.verdict().labelKey(), group.count()))
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
    private static ParkingDtos.MoneyDto money(Money amount) {
        return amount == null ? null : new ParkingDtos.MoneyDto(amount.minorUnits(), amount.currencyCode());
    }
}
