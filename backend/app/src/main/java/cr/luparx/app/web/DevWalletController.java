package cr.luparx.app.web;

import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.money.Money;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.parking.entity.WalletTransaction;
import cr.luparx.parking.model.WalletTopupSource;
import cr.luparx.parking.service.WalletService;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Crediting your own wallet — <b>development only</b>.
 *
 * <p>Without it a fresh account cannot park, and every test of the paid flow would have to start by
 * borrowing an administrator's session. With it, a developer or a QA engineer runs the whole citizen
 * journey from an empty account.</p>
 *
 * <h2>Why this is safe, and how it is kept that way</h2>
 *
 * <p>The bean only exists under the {@code dev} profile: in any other profile the class is not
 * registered, so the route does not exist at all and answers 404 — not 403, which would at least
 * confirm that a self-service money endpoint is somewhere in the build. That is stronger than a flag
 * checked inside the handler, because there is no code path to reach.</p>
 *
 * <p>Every movement it creates is stamped {@link WalletTopupSource#DEV}, so a ledger that somehow
 * contains one in a real environment says exactly where it came from instead of looking like a
 * legitimate counter payment.</p>
 */
@RestController
@RequestMapping("/api/v1/citizen/wallet")
@Profile("dev")
@Tag(name = "Citizen · Wallet (dev)", description = "Development-only self top-up; absent in every other profile.")
public class DevWalletController {

    private static final Logger LOGGER = LoggerFactory.getLogger(DevWalletController.class);

    /** A ceiling even here: a fixture that credits a billion colones hides overflow bugs. */
    private static final long MAX_DEV_TOPUP_MINOR = 1_000_000_00L;

    private final WalletService walletService;
    private final cr.luparx.app.billing.TopupPaymentService topupPaymentService;
    private final TenantService tenantService;
    private final ParkingMapper mapper;

    public DevWalletController(WalletService walletService,
                               cr.luparx.app.billing.TopupPaymentService topupPaymentService,
                               TenantService tenantService, ParkingMapper mapper) {
        this.walletService = walletService;
        this.topupPaymentService = topupPaymentService;
        this.tenantService = tenantService;
        this.mapper = mapper;
        LOGGER.warn("Development profile: POST /api/v1/citizen/wallet/topups is enabled and lets any citizen "
                + "credit their own wallet. It does not exist outside the dev profile.");
    }

    @PostMapping("/topups")
    @PreAuthorize("hasRole('CITIZEN')")
    @Operation(summary = "Credit my own wallet (development profile only)")
    public ParkingDtos.TopupResponse topUp(@Valid @RequestBody ParkingDtos.DevTopupRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        UserId userId = TenantContextHolder.requireUserId();
        Tenant tenant = tenantService.requireActive(tenantId);
        long minor = Math.min(request.amountMinor().longValue(), MAX_DEV_TOPUP_MINOR);
        Money amount = Money.ofMinor(minor, tenant.getCurrencyCode());
        // Through the payment as well (v0.35), even here. The development shortcut standing in for
        // the citizen paying by card is exactly the path a demonstration exercises, and one that
        // credited a wallet without recording a payment would show a reconciliation screen that
        // cannot see half of its own data.
        WalletTransaction transaction = topupPaymentService.topUp(tenantId, userId, amount, null,
                WalletTopupSource.DEV, "DEV-" + java.util.UUID.randomUUID(), userId, null).transaction();
        return new ParkingDtos.TopupResponse(transaction.getId(), mapper.toMoney(transaction.getAmount()),
                new ParkingDtos.MoneyDto(transaction.getBalanceAfterMinor(), transaction.getCurrencyCode()),
                WalletTopupSource.DEV.name(), null, transaction.getCreatedAt(), false);
    }
}
