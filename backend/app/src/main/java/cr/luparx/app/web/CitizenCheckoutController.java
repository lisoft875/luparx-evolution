package cr.luparx.app.web;

import cr.luparx.app.config.PaymentsProperties;
import cr.luparx.app.payments.WalletCheckoutService;
import cr.luparx.app.web.dto.CheckoutDtos;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.billing.entity.Payment;
import cr.luparx.billing.entity.PaymentCheckout;
import cr.luparx.billing.model.GatewayErrorCode;
import cr.luparx.billing.port.CardNetwork;
import cr.luparx.billing.port.PaymentGateway;
import cr.luparx.billing.service.PaymentCheckoutService;
import cr.luparx.billing.service.PaymentService;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.money.Money;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Paying a top-up by card, from the citizen's side (ADR 0023).
 *
 * <h2>Tres rutas y una regla</h2>
 *
 * <p>Ask whether cards are accepted here, open a hand-off, and find out what happened. <b>None of them
 * accepts a result.</b> The citizen comes back with a token and nothing else, and what happened is
 * learnt by asking the provider — a return that carried {@code ?status=ok} would let anybody credit
 * their own balance from the address bar, and that is the classic defect of payment integrations
 * (ADR 0023 §4).</p>
 *
 * <h2>Qué no se le manda al proveedor</h2>
 *
 * <p>No name, no email, no identity document. The provider is told an amount, the municipality's name
 * for the statement, and an opaque reference. It does not need to know who the citizen is, so it is not
 * told — and when a provider genuinely requires an address for its own receipt, that is the moment to
 * add one field, not before.</p>
 */
@RestController
@RequestMapping("/api/v1/citizen/wallet")
@Tag(name = "Citizen · Card top-up", description = "Hosted-checkout card payments into the balance.")
public class CitizenCheckoutController {

    private final WalletCheckoutService checkoutService;
    private final PaymentCheckoutService checkouts;
    private final PaymentService payments;
    private final TenantService tenants;
    private final PaymentsProperties properties;

    public CitizenCheckoutController(WalletCheckoutService checkoutService, PaymentCheckoutService checkouts,
                                     PaymentService payments, TenantService tenants,
                                     PaymentsProperties properties) {
        this.checkoutService = checkoutService;
        this.checkouts = checkouts;
        this.payments = payments;
        this.tenants = tenants;
        this.properties = properties;
    }

    @GetMapping("/card-payments")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Whether this municipality accepts cards, and which ones")
    public CheckoutDtos.CardPaymentAvailability availability() {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Tenant tenant = tenants.requireActive(tenantId);
        Optional<PaymentGateway> gateway = checkoutService.gatewayFor(tenantId);
        List<CardNetwork> networks = new ArrayList<>();
        gateway.ifPresent(present -> networks.addAll(present.supportedNetworks()));
        return new CheckoutDtos.CardPaymentAvailability(
                gateway.isPresent(),
                gateway.map(PaymentGateway::providerId).orElse(null),
                List.copyOf(networks),
                new ParkingDtos.MoneyDto(properties.minTopupMinor(), tenant.getCurrencyCode()),
                new ParkingDtos.MoneyDto(properties.maxTopupMinor(), tenant.getCurrencyCode()));
    }

    /**
     * Opens the hand-off and answers with where to go.
     *
     * <p>The client navigates to {@code redirectUrl}; it must not fetch it. An {@code Idempotency-Key}
     * makes a retry reach the same hand-off instead of a second charge — the header is honoured here and
     * not merely accepted.</p>
     */
    @PostMapping("/checkouts")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Start a card payment into my balance in this municipality")
    public CheckoutDtos.CheckoutResponse start(
            @Valid @RequestBody CheckoutDtos.StartCheckoutRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        Tenant tenant = tenants.requireActive(tenantId);
        Money amount = Money.ofMinor(request.amountMinor().longValue(), tenant.getCurrencyCode());

        WalletCheckoutService.Started started = checkoutService.start(tenantId, userId, amount,
                idempotencyKey, LocaleContextHolder.getLocale(), null);
        PaymentCheckout checkout = started.checkout();
        return new CheckoutDtos.CheckoutResponse(
                checkout.getId(),
                checkout.getProvider(),
                checkout.getRedirectUrl(),
                checkout.getState(),
                checkout.getState().labelKey(),
                new ParkingDtos.MoneyDto(started.payment().getGrossAmountMinor(),
                        started.payment().getCurrencyCode()),
                checkout.getExpiresAt(),
                started.opened());
    }

    /**
     * The citizen is back from the provider's page.
     *
     * <p>Takes a token and asks the provider. Answers the same way for a token that matches nothing and
     * for one already used, so the endpoint cannot be used to find out whether somebody else's payment
     * happened (SECURITY.md §4). The token is burnt after use; the outcome stays readable through
     * {@link #result}, which is what the interface polls if it needs to.</p>
     */
    @PostMapping("/checkouts/return")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Come back from the provider's page and find out what happened")
    public CheckoutDtos.CheckoutResultResponse returned(@RequestParam("token") String token) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();

        PaymentCheckout checkout = checkouts.findByReturnToken(token)
                .filter(found -> found.getTenantId().equals(tenantId.value()))
                // The authorisation that actually matters: the token is defence in depth, being the owner
                // is the rule. Without this line the link would work for whoever held it.
                .filter(found -> found.getUserId().equals(userId.value()))
                .orElseThrow(() -> NotFoundException.of(GatewayErrorCode.PAYMENT_RETURN_TOKEN_INVALID,
                        "error.payment.returnToken.invalid"));

        WalletCheckoutService.Resolution resolution = checkoutService.resolve(checkout);
        checkouts.markReturnTokenUsed(checkout.getId());
        return describe(tenantId, checkout.getId(), resolution);
    }

    /**
     * Where an attempt stands, for an interface waiting on a provider that is slow.
     *
     * <p>Read-only and safe to poll: it reports what is recorded and does not ask the provider again. The
     * asking is done by the return above and by the periodic sweep, so a client that polls cannot turn
     * one citizen's patience into a call per second against a gateway.</p>
     */
    @GetMapping("/checkouts/{checkoutId}")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Where my card payment stands")
    public CheckoutDtos.CheckoutResultResponse status(@PathVariable UUID checkoutId) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        PaymentCheckout checkout = checkouts.require(tenantId, checkoutId);
        // Somebody else's hand-off answers exactly like one that does not exist. Telling the two apart
        // would turn this id into an oracle for "did that person pay" (SECURITY.md §4).
        if (!checkout.getUserId().equals(userId.value())) {
            throw NotFoundException.of(GatewayErrorCode.PAYMENT_CHECKOUT_NOT_FOUND,
                    "error.payment.checkout.notFound");
        }
        return describe(tenantId, checkout.getId(), null);
    }

    private CheckoutDtos.CheckoutResultResponse describe(TenantId tenantId, UUID checkoutId,
                                                        WalletCheckoutService.Resolution resolution) {
        PaymentCheckout checkout = checkouts.require(tenantId, checkoutId);
        Payment payment = payments.require(tenantId, checkout.getPaymentId());
        CardNetwork network = checkout.getNetwork() == null ? CardNetwork.UNKNOWN : checkout.getNetwork();
        boolean credited = resolution != null && resolution.credited();
        return new CheckoutDtos.CheckoutResultResponse(
                checkout.getId(),
                checkout.getState(),
                checkout.getState().labelKey(),
                payment.getStatus(),
                payment.getStatus().labelKey(),
                new ParkingDtos.MoneyDto(payment.getGrossAmountMinor(), payment.getCurrencyCode()),
                credited,
                network,
                network.labelKey(),
                checkout.getCardLast4(),
                payment.getFailureCode(),
                payment.getFailureReason(),
                checkout.getResolvedAt());
    }
}
