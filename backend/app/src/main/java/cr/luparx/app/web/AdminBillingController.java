package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.web.dto.BillingDtos;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.billing.entity.Payment;
import cr.luparx.billing.entity.Settlement;
import cr.luparx.billing.entity.SettlementLine;
import cr.luparx.billing.model.PaymentState;
import cr.luparx.billing.model.ReconciliationStatus;
import cr.luparx.billing.service.PaymentService;
import cr.luparx.billing.service.SettlementService;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.money.Money;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What the municipality charged, what the provider confirmed, and what is still owed
 * (CONTRACT.md v0.35).
 *
 * <p>Three questions and this is the one screen that answers all three from the same data. Behind
 * {@code WALLET_TOPUP} — the capability the cashier and the finance role already hold — because the
 * person who reconciles the money is the person who handles it, and inventing a fourth capability
 * for reading what they already produce would be ceremony.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/billing")
@Tag(name = "Admin · Billing & reconciliation",
        description = "Payments received, provider settlements and the reconciliation between them.")
public class AdminBillingController {

    /** A month, which is the period a treasurer thinks in and the one a provider settles in. */
    private static final int DEFAULT_WINDOW_DAYS = 30;

    /** How many unsettled payments one listing hands back. A page nobody finishes is a page nobody reads. */
    private static final int MAX_UNSETTLED = 200;

    private final PaymentService paymentService;
    private final SettlementService settlementService;
    private final TenantService tenantService;
    private final AuditRecorder auditRecorder;

    public AdminBillingController(PaymentService paymentService,
                                  SettlementService settlementService,
                                  TenantService tenantService,
                                  AuditRecorder auditRecorder) {
        this.paymentService = paymentService;
        this.settlementService = settlementService;
        this.tenantService = tenantService;
        this.auditRecorder = auditRecorder;
    }

    /**
     * The three numbers, for a period.
     *
     * <p>Charged, of which confirmed, of which still owed. Summed in the database rather than from a
     * page of rows: a month is tens of thousands of payments, and a total built from the first twenty
     * of them is a number that looks right and is not.</p>
     */
    @GetMapping("/totals")
    @PreAuthorize("hasAuthority('PERM_WALLET_TOPUP')")
    @Operation(summary = "What was charged, settled and is still owed in a period")
    public BillingDtos.BillingTotalsResponse totals(@RequestParam(required = false) Instant from,
                                                    @RequestParam(required = false) Instant to) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Tenant tenant = tenantService.requireActive(tenantId);
        Instant start = from == null ? Instant.now().minus(DEFAULT_WINDOW_DAYS, ChronoUnit.DAYS) : from;
        Instant end = to == null ? Instant.now() : to;
        PaymentService.Totals totals = paymentService.totals(tenantId, start, end, tenant.getCurrencyCode());
        return new BillingDtos.BillingTotalsResponse(
                money(totals.capturedGross()), money(totals.capturedNet()),
                money(totals.settledGross()), money(totals.unsettledGross()),
                totals.capturedCount(), totals.failedCount(), start, end);
    }

    @GetMapping("/payments")
    @PreAuthorize("hasAuthority('PERM_WALLET_TOPUP')")
    @Operation(summary = "Payments of this municipality (paginated, newest first)")
    public PageResponse<BillingDtos.PaymentResponse> payments(
            @RequestParam(required = false) PaymentState status,
            @RequestParam(required = false) ReconciliationStatus reconciliation,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        PageRequest request = PageRequest.parse(page, size, null);
        Instant start = from == null ? Instant.now().minus(DEFAULT_WINDOW_DAYS, ChronoUnit.DAYS) : from;
        Instant end = to == null ? Instant.now() : to;
        PageResponse<Payment> found = paymentService.search(tenantId, status, reconciliation, start, end, request);
        return PageResponse.of(found.items().stream().map(AdminBillingController::toPayment).toList(),
                request.page(), request.size(), found.totalElements());
    }

    /**
     * Charged and nobody has confirmed it.
     *
     * <p>The list worth opening every week, and the reason the rest of this module exists. Cash and
     * adjustments are not in it: nobody is ever going to report the counter's day in a provider's
     * statement, and a list that included it would be a permanent alarm about something that is not
     * a problem — which is how a municipality learns to stop looking at the list.</p>
     */
    @GetMapping("/payments/unsettled")
    @PreAuthorize("hasAuthority('PERM_WALLET_TOPUP')")
    @Operation(summary = "Payments captured in the period that no settlement has confirmed")
    public List<BillingDtos.PaymentResponse> unsettled(@RequestParam(required = false) Instant from,
                                                       @RequestParam(required = false) Instant to) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Instant start = from == null ? Instant.now().minus(DEFAULT_WINDOW_DAYS, ChronoUnit.DAYS) : from;
        Instant end = to == null ? Instant.now() : to;
        return paymentService.unsettled(tenantId, start, end, MAX_UNSETTLED).stream()
                .map(AdminBillingController::toPayment)
                .toList();
    }

    @GetMapping("/settlements")
    @PreAuthorize("hasAuthority('PERM_WALLET_TOPUP')")
    @Operation(summary = "Statements this municipality has received, newest period first")
    public List<BillingDtos.SettlementResponse> settlements(
            @RequestParam(required = false, defaultValue = "20") int limit) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        return settlementService.recent(tenantId, limit).stream()
                .map(AdminBillingController::toSettlement)
                .toList();
    }

    /**
     * Imports a statement and reconciles it in the same call.
     *
     * <p>One step, deliberately. Importing without matching would leave the municipality holding two
     * half-answers and a manual step between them, which is exactly the situation this module exists
     * to end.</p>
     */
    @PostMapping("/settlements")
    @PreAuthorize("hasAuthority('PERM_WALLET_TOPUP')")
    @Operation(summary = "Import a provider statement and reconcile it against this municipality's payments")
    public BillingDtos.ReconciliationResponse importSettlement(
            @Valid @RequestBody BillingDtos.ImportSettlementRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        String currency = request.currencyCode().toUpperCase(java.util.Locale.ROOT);

        List<SettlementService.Line> lines = new ArrayList<>(request.lines().size());
        for (BillingDtos.SettlementLineRequest line : request.lines()) {
            lines.add(new SettlementService.Line(line.providerReference().trim(),
                    Money.ofMinor(line.grossAmountMinor(), currency),
                    Money.ofMinor(line.feeAmountMinor(), currency),
                    Money.ofMinor(line.netAmountMinor(), currency),
                    line.occurredAt()));
        }

        SettlementService.Result result = settlementService.importAndReconcile(tenantId,
                new SettlementService.Command(request.provider().trim(), request.externalReference().trim(),
                        request.periodStart(), request.periodEnd(),
                        Money.ofMinor(request.declaredGrossMinor(), currency),
                        Money.ofMinor(request.declaredFeeMinor(), currency),
                        Money.ofMinor(request.declaredNetMinor(), currency),
                        request.depositExpectedOn(), request.depositReference(), lines),
                TenantContextHolder.requireUserId().value());

        // The findings go in the audit entry, not only the fact that a statement was imported. "Who
        // imported the statement where forty payments went missing" is the question somebody asks
        // three months later, and it has to be answerable without re-running the reconciliation.
        auditRecorder.record(AuditAction.SETTLEMENT_IMPORTED, "settlement",
                result.settlement().getId().toString(),
                Map.of("provider", request.provider(),
                        "reference", request.externalReference(),
                        "lines", String.valueOf(result.lineCount()),
                        "matched", String.valueOf(result.matched()),
                        "unknown", String.valueOf(result.unknownPayments()),
                        "mismatched", String.valueOf(result.amountMismatches()),
                        "duplicates", String.valueOf(result.duplicates()),
                        "missing", String.valueOf(result.missingPayments()),
                        "declaredTotalsDisagree", String.valueOf(result.declaredTotalsDisagree())));

        return toReconciliation(result, settlementService.findings(tenantId, result.settlement().getId()));
    }

    @GetMapping("/settlements/{id}/findings")
    @PreAuthorize("hasAuthority('PERM_WALLET_TOPUP')")
    @Operation(summary = "The lines of a statement that need somebody to look at them")
    public List<BillingDtos.SettlementLineResponse> findings(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        settlementService.require(tenantId, id);
        return settlementService.findings(tenantId, id).stream()
                .map(AdminBillingController::toLine)
                .toList();
    }

    /** The municipality is claiming against a statement; it stops counting as settled meanwhile. */
    @PostMapping("/settlements/{id}/dispute")
    @PreAuthorize("hasAuthority('PERM_WALLET_TOPUP')")
    @Operation(summary = "Mark a statement as disputed")
    public BillingDtos.SettlementResponse dispute(@PathVariable UUID id) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Settlement settlement = settlementService.dispute(tenantId, id);
        auditRecorder.record(AuditAction.SETTLEMENT_DISPUTED, "settlement", id.toString(),
                Map.of("provider", settlement.getProvider(),
                        "reference", settlement.getExternalReference()));
        return toSettlement(settlement);
    }

    // --- mapping ------------------------------------------------------------------------------------

    private static BillingDtos.PaymentResponse toPayment(Payment payment) {
        return new BillingDtos.PaymentResponse(
                payment.getId(),
                payment.getMethod(),
                payment.getMethod().labelKey(),
                payment.getProvider(),
                payment.getProviderReference(),
                payment.getStatus(),
                payment.getStatus().labelKey(),
                payment.getPurpose(),
                money(payment.getGross()),
                money(payment.getFee()),
                money(payment.getNet()),
                payment.getReconciliationStatus(),
                payment.getReconciliationStatus().labelKey(),
                payment.getRequestedAt(),
                payment.getConfirmedAt(),
                payment.getSettledAt(),
                payment.getFailureCode(),
                payment.getFailureReason(),
                payment.getUserId(),
                payment.getTargetType(),
                payment.getTargetId());
    }

    private static BillingDtos.SettlementResponse toSettlement(Settlement settlement) {
        return new BillingDtos.SettlementResponse(
                settlement.getId(),
                settlement.getProvider(),
                settlement.getExternalReference(),
                settlement.getPeriodStart(),
                settlement.getPeriodEnd(),
                money(settlement.getDeclaredGross()),
                money(settlement.getDeclaredFee()),
                money(settlement.getDeclaredNet()),
                settlement.getDepositExpectedOn(),
                settlement.getDepositReference(),
                settlement.getStatus(),
                settlement.getStatus().labelKey(),
                settlement.getImportedAt(),
                settlement.getReconciledAt());
    }

    private static BillingDtos.SettlementLineResponse toLine(SettlementLine line) {
        return new BillingDtos.SettlementLineResponse(
                line.getId(),
                line.getProviderReference(),
                money(line.getGross()),
                money(line.getFee()),
                money(line.getNet()),
                line.getOccurredAt(),
                line.getPaymentId(),
                line.getMatchStatus(),
                line.getMatchStatus().labelKey());
    }

    private static BillingDtos.ReconciliationResponse toReconciliation(SettlementService.Result result,
                                                                       List<SettlementLine> findings) {
        return new BillingDtos.ReconciliationResponse(
                toSettlement(result.settlement()),
                result.lineCount(), result.matched(), result.unknownPayments(), result.amountMismatches(),
                result.duplicates(), result.missingPayments(),
                money(result.lineGross()), money(result.lineFee()), money(result.lineNet()),
                result.declaredTotalsDisagree(), result.hasFindings(),
                findings.stream().map(AdminBillingController::toLine).toList());
    }

    /** Null stays null: an unknown fee is not a fee of zero, and rendering it as one is a lie. */
    private static ParkingDtos.MoneyDto money(Money amount) {
        return amount == null ? null : new ParkingDtos.MoneyDto(amount.minorUnits(), amount.currencyCode());
    }
}
