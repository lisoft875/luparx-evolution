package cr.luparx.app.web;

import cr.luparx.app.audit.AuditRecorder;
import cr.luparx.app.idempotency.IdempotencyFilter;
import cr.luparx.app.billing.TopupPaymentService;
import cr.luparx.app.web.dto.ParkingDtos;
import cr.luparx.core.audit.AuditAction;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.money.Money;
import cr.luparx.core.tenant.TenantContextHolder;
import cr.luparx.identity.entity.User;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.parking.entity.WalletTopupCode;
import cr.luparx.parking.entity.WalletTransaction;
import cr.luparx.parking.model.WalletTopupSource;
import cr.luparx.parking.service.WalletService;
import cr.luparx.parking.service.WalletTopupCodeService;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Money going into a wallet at the municipality's own counter.
 *
 * <h2>Why its own permission</h2>
 *
 * <p>Both routes are guarded by {@code PERM_WALLET_TOPUP} and never by a role name. Handing out
 * credit is the cashier's job and the first thing a municipal auditor asks about, so a municipality
 * must be able to give it to the person at the window without also giving them user administration —
 * and to take it away without touching a controller.</p>
 *
 * <h2>Why this is not the endpoint a supermarket chain would call</h2>
 *
 * <p>A cashier here is a <em>person</em> with an account in this municipality, authenticated through
 * the admin portal, whose session carries a tenant and whose every action is attributable to them by
 * name. A partner network is a <em>system</em>: it has no seat in any municipality, authenticates
 * server to server, credits across many municipalities in one integration, and needs settlement,
 * reconciliation and a contractual dispute process. Making one endpoint serve both would mean either
 * issuing portal sessions to a machine or weakening what a portal session means — see
 * {@code backend/README.md} for the contract the partner integration will use.</p>
 */
@RestController
@RequestMapping("/api/v1/admin/wallets")
@Tag(name = "Admin · Wallets", description = "Crediting citizens' wallets at the municipal counter.")
public class AdminWalletController {

    private final WalletService walletService;
    private final cr.luparx.app.billing.TopupPaymentService topupPaymentService;
    private final WalletTopupCodeService topupCodeService;
    private final UserRepository userRepository;
    private final TenantService tenantService;
    private final ParkingMapper mapper;
    private final AuditRecorder auditRecorder;

    public AdminWalletController(WalletService walletService,
                                 cr.luparx.app.billing.TopupPaymentService topupPaymentService,
                                 WalletTopupCodeService topupCodeService,
                                 UserRepository userRepository,
                                 TenantService tenantService,
                                 ParkingMapper mapper,
                                 AuditRecorder auditRecorder) {
        this.walletService = walletService;
        this.topupPaymentService = topupPaymentService;
        this.topupCodeService = topupCodeService;
        this.userRepository = userRepository;
        this.tenantService = tenantService;
        this.mapper = mapper;
        this.auditRecorder = auditRecorder;
    }

    /**
     * Resolves the code a citizen dictated, returning only what the cashier needs to say out loud.
     *
     * <p>First name and the initial of the family name, plus the municipality and its currency. No
     * balance, no email, no telephone, no document number: a cashier confirming "Ana M., San José?"
     * does not need the account behind the code, and a screen that showed it would turn every till
     * into a place where an overheard code buys somebody's personal data.</p>
     *
     * <p>A malformed code fails on its check character before the database is touched
     * ({@code TOPUP_CODE_INVALID}), which is what tells the cashier to read it again; a well-formed
     * code that belongs to nobody here is a plain {@code TOPUP_CODE_NOT_FOUND}. The two are told
     * apart on purpose — they mean different things at a counter.</p>
     */
    @GetMapping("/topup-codes/{code}")
    @PreAuthorize("hasAuthority('PERM_WALLET_TOPUP')")
    @Operation(summary = "Confirm whose wallet a dictated top-up code belongs to")
    public ResponseEntity<ParkingDtos.TopupCodeResolutionResponse> resolve(@PathVariable String code) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        WalletTopupCode resolved = topupCodeService.resolve(tenantId, code);
        User user = userRepository.findById(resolved.getUserId())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.TOPUP_CODE_NOT_FOUND,
                        "error.wallet.topupCode.notFound"));
        Tenant tenant = tenantService.require(tenantId);
        auditRecorder.record(AuditAction.WALLET_TOPUP_CODE_RESOLVED, "wallet-topup-code",
                resolved.getId().toString(), Map.of("userId", resolved.getUserId().toString()));
        return ResponseEntity.ok()
                // Never cached anywhere: it is a person's name resolved from a code somebody read out.
                .cacheControl(CacheControl.noStore())
                .body(new ParkingDtos.TopupCodeResolutionResponse(user.getGivenName(),
                        initialOf(user.getFamilyName()), tenant.getDisplayName(), tenant.getCurrencyCode()));
    }

    /**
     * Credits a wallet. Requires {@code Idempotency-Key}.
     *
     * <p>Two layers of protection, because they fail differently. The header replays the stored
     * response when the same request arrives twice — a double click, a retried timeout. The
     * {@code externalReference} (the till's receipt number) is matched against what has already been
     * credited in this municipality, so a resend from another process, another shift or a reprinted
     * receipt adds nothing; the response says so with {@code alreadyApplied} rather than pretending
     * it credited again.</p>
     *
     * <p>The citizen is identified by their top-up code — the ordinary case at a counter — or by
     * their identifier, for the back office correcting something. Exactly one of the two.</p>
     */
    @PostMapping("/topups")
    @PreAuthorize("hasAuthority('PERM_WALLET_TOPUP')")
    @Operation(summary = "Credit a citizen's wallet at the municipal counter. Requires Idempotency-Key.")
    public ParkingDtos.TopupResponse topUp(
            @RequestHeader(value = IdempotencyFilter.HEADER, required = false) String idempotencyKey,
            @Valid @RequestBody ParkingDtos.AdminTopupRequest request) {
        TenantId tenantId = TenantContextHolder.requireTenantId();
        Tenant tenant = tenantService.requireActive(tenantId);
        UserId beneficiary = resolveBeneficiary(tenantId, request);

        Money amount = Money.ofMinor(request.amountMinor().longValue(), tenant.getCurrencyCode());
        // Through the payment now (v0.35): the counter takes real money, and money that entered
        // without a Payment is money the treasurer cannot prove came in. The cash keeps nothing, so
        // there is no fee.
        TopupPaymentService.Result received = topupPaymentService.topUp(tenantId, beneficiary, amount,
                idempotencyKey, WalletTopupSource.MUNICIPAL_COUNTER, request.externalReference(),
                TenantContextHolder.requireUserId(), null);
        WalletTransaction transaction = received.transaction();
        // The movement came back with somebody else's request key: it was credited earlier under the
        // same external reference, and this call added nothing. Saying so is the difference between a
        // till that reprints a receipt and a till that charges twice.
        boolean alreadyApplied = received.alreadyApplied()
                || (transaction.getIdempotencyKey() != null && idempotencyKey != null
                    && !idempotencyKey.equals(transaction.getIdempotencyKey()));

        auditRecorder.record(AuditAction.WALLET_TOPUP_RECORDED, "wallet-transaction",
                transaction.getId().toString(),
                Map.of("userId", beneficiary.value().toString(),
                        "amountMinor", String.valueOf(amount.minorUnits()),
                        "source", WalletTopupSource.MUNICIPAL_COUNTER.name(),
                        "externalReference", request.externalReference() == null ? "-" : request.externalReference(),
                        "paymentId", received.paymentId().toString(),
                        "alreadyApplied", String.valueOf(alreadyApplied)));

        return new ParkingDtos.TopupResponse(transaction.getId(), mapper.toMoney(transaction.getAmount()),
                new ParkingDtos.MoneyDto(transaction.getBalanceAfterMinor(), transaction.getCurrencyCode()),
                WalletTopupSource.MUNICIPAL_COUNTER.name(), transaction.getExternalReference(),
                transaction.getCreatedAt(), alreadyApplied);
    }

    /**
     * Exactly one way of naming the citizen. Accepting both, or neither, would let a mistyped code
     * fall through to an identifier somebody pasted from another screen.
     */
    private UserId resolveBeneficiary(TenantId tenantId, ParkingDtos.AdminTopupRequest request) {
        boolean hasCode = request.topupCode() != null && !request.topupCode().isBlank();
        boolean hasUser = request.userId() != null;
        if (hasCode == hasUser) {
            throw new ValidationException("topupCode", ErrorCode.VALIDATION_FAILED,
                    "error.wallet.topup.beneficiary");
        }
        if (hasCode) {
            return UserId.of(topupCodeService.resolve(tenantId, request.topupCode()).getUserId());
        }
        // By identifier the person still has to have a wallet here; the service creates it on demand
        // and the membership check happened when the token was issued.
        return UserId.of(request.userId());
    }

    /** "Ana Morales" → "M." — enough to confirm out loud, not enough to identify somebody. */
    private String initialOf(String familyName) {
        if (familyName == null || familyName.isBlank()) {
            return "";
        }
        return familyName.trim().substring(0, 1).toUpperCase(java.util.Locale.ROOT) + ".";
    }

}
