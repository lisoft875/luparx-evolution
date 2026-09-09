package cr.luparx.parking.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.money.Money;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.parking.entity.WalletAccount;
import cr.luparx.parking.entity.WalletTransaction;
import cr.luparx.parking.model.WalletTopupSource;
import cr.luparx.parking.model.WalletTransactionType;
import cr.luparx.parking.repository.WalletAccountRepository;
import cr.luparx.parking.repository.WalletTransactionRepository;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.service.TenantService;
import org.springframework.data.domain.Page;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * The citizen's money in one municipality.
 *
 * <p>Finance is per tenant by contract (CONTRACT.md v0.2, rule 6): there is no global balance, and
 * the currency of a wallet is the municipality's own, taken from the tenant rather than assumed.
 * That is what lets the same person hold a balance in two countries without either amount being
 * silently reinterpreted.</p>
 *
 * <p>Every charge takes the row lock before deciding whether the balance suffices. Optimistic
 * locking would be the wrong tool: two concurrent charges would both read the same balance, both
 * find it sufficient, and one would fail at commit with a conflict the citizen sees as an error even
 * though their money was there. A pessimistic lock serialises them and both succeed, in order.</p>
 *
 * <p>Nothing here starts or commits a transaction of its own: the methods join the caller's, because
 * "cobro y sesión se escriben en la misma transacción" is an invariant of the contract and not a
 * detail of one call site.</p>
 */
@Service
public class WalletService {

    private final WalletAccountRepository accountRepository;
    private final WalletTransactionRepository transactionRepository;
    private final TenantService tenantService;
    private final Clock clock;

    public WalletService(WalletAccountRepository accountRepository,
                         WalletTransactionRepository transactionRepository,
                         TenantService tenantService,
                         Clock clock) {
        this.accountRepository = accountRepository;
        this.transactionRepository = transactionRepository;
        this.tenantService = tenantService;
        this.clock = clock;
    }

    /** The citizen's wallet in this municipality, opened empty in its currency the first time. */
    @Transactional
    public WalletAccount require(TenantId tenantId, UserId userId) {
        WalletAccount existing = accountRepository.findByTenantIdAndUserId(tenantId.value(), userId.value())
                .orElse(null);
        if (existing != null) {
            return existing;
        }
        Tenant tenant = tenantService.require(tenantId);
        Instant now = clock.instant();
        return accountRepository.save(new WalletAccount(Uuid7.generate(), tenantId.value(), userId.value(),
                Money.zero(tenant.getCurrencyCode()), now));
    }

    /** Balance without opening an account: a citizen who never paid has zero, not a row. */
    @Transactional(readOnly = true)
    public Money balance(TenantId tenantId, UserId userId) {
        return accountRepository.findByTenantIdAndUserId(tenantId.value(), userId.value())
                .map(WalletAccount::getBalance)
                .orElseGet(() -> Money.zero(tenantService.require(tenantId).getCurrencyCode()));
    }

    /**
     * Debits the wallet, or refuses.
     *
     * @param amount     the amount to charge, given positive; stored negative in the ledger
     * @throws ConflictException {@code INSUFFICIENT_BALANCE} when the balance does not cover it. The
     *         caller is expected to let this abort the whole transaction, so that no session exists
     *         without its charge and no charge exists without its session.
     */
    @Transactional
    public WalletTransaction charge(TenantId tenantId, UserId userId, Money amount, WalletTransactionType type,
                                    UUID sessionId, String idempotencyKey) {
        if (amount.isNegative()) {
            throw new IllegalArgumentException("a charge is given as a positive amount");
        }
        if (amount.isZero()) {
            throw new IllegalArgumentException("a zero charge must not be written to the ledger");
        }
        WalletAccount account = lock(tenantId, userId);
        requireSameCurrency(account, amount);
        if (!account.canAfford(amount)) {
            throw ConflictException.of(ErrorCode.INSUFFICIENT_BALANCE, "error.parking.wallet.insufficient");
        }
        Instant now = clock.instant();
        account.apply(amount.negated(), now);
        accountRepository.save(account);
        return transactionRepository.save(new WalletTransaction(Uuid7.generate(), tenantId.value(),
                account.getId(), userId.value(), type, amount.negated(), account.getBalanceMinor(), sessionId,
                idempotencyKey, now));
    }

    /**
     * Credits the wallet. Money only ever enters this way — a session that ends early gives minutes
     * back, never money (CONTRACT.md v0.2, rule 5).
     */
    @Transactional
    public WalletTransaction topUp(TenantId tenantId, UserId userId, Money amount, String idempotencyKey) {
        return topUp(tenantId, userId, amount, idempotencyKey, null, null, null);
    }

    /**
     * Credits the wallet and records where the money came from (V18_0).
     *
     * <p><b>Idempotent by the payer's own reference.</b> When {@code externalReference} is given, a
     * movement already credited under the same municipality, source and reference is returned
     * unchanged and nothing is added. That is the layer that survives what the HTTP header cannot: a
     * till that reprints a receipt through a different process, or a partner replaying a whole batch
     * with new request identifiers. The unique index is what makes it hold with several instances —
     * the check below is the fast path, the index is the guarantee.</p>
     *
     * @param source            which channel produced it; null only for the legacy call above
     * @param externalReference the payer's own reference, or null when there is none
     * @param createdBy         the operator who keyed it, when a person did
     */
    @Transactional
    public WalletTransaction topUp(TenantId tenantId, UserId userId, Money amount, String idempotencyKey,
                                   WalletTopupSource source, String externalReference, UserId createdBy) {
        if (!amount.isPositive()) {
            throw new IllegalArgumentException("a top-up is a positive amount");
        }
        String reference = externalReference == null || externalReference.isBlank()
                ? null
                : externalReference.trim();
        if (reference != null && source != null) {
            Optional<WalletTransaction> already = transactionRepository
                    .findByTenantIdAndSourceAndExternalReference(tenantId.value(), source, reference);
            if (already.isPresent()) {
                return already.get();
            }
        }
        WalletAccount account = lock(tenantId, userId);
        requireSameCurrency(account, amount);
        Instant now = clock.instant();
        account.apply(amount, now);
        accountRepository.save(account);
        try {
            return transactionRepository.saveAndFlush(new WalletTransaction(Uuid7.generate(), tenantId.value(),
                    account.getId(), userId.value(), WalletTransactionType.TOP_UP, amount,
                    account.getBalanceMinor(), null, idempotencyKey, source, reference,
                    createdBy == null ? null : createdBy.value(), now));
        } catch (DataIntegrityViolationException duplicate) {
            // Two tills raced on the same reference. The index decided; the loser must not credit,
            // and the transaction is rolled back by the caller's boundary rather than half-applied.
            throw ConflictException.of(ErrorCode.TOPUP_REFERENCE_ALREADY_USED,
                    "error.wallet.topup.referenceUsed");
        }
    }

    @Transactional(readOnly = true)
    public PageResponse<WalletTransaction> listTransactions(TenantId tenantId, UserId userId, PageRequest request) {
        Page<WalletTransaction> page = transactionRepository.findByTenantIdAndUserIdOrderByCreatedAtDesc(
                tenantId.value(), userId.value(),
                org.springframework.data.domain.PageRequest.of(request.page(), request.size()));
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    private WalletAccount lock(TenantId tenantId, UserId userId) {
        // The account is created first when absent, then re-read with the lock: SELECT ... FOR UPDATE
        // cannot lock a row that does not exist yet.
        require(tenantId, userId);
        // Flushed explicitly: SELECT ... FOR UPDATE cannot see a row that is still pending in the
        // persistence context, and relying on Hibernate's auto-flush to notice the overlap is a
        // subtlety nobody should have to re-derive when reading this.
        accountRepository.flush();
        return accountRepository.lockByTenantIdAndUserId(tenantId.value(), userId.value())
                .orElseThrow(() -> new IllegalStateException("wallet disappeared between creation and lock"));
    }

    /**
     * A wallet holds one currency, the municipality's. If a municipality ever changes its currency
     * the existing balances must be migrated deliberately, not reinterpreted on the next charge.
     */
    private void requireSameCurrency(WalletAccount account, Money amount) {
        if (!account.getCurrencyCode().equals(amount.currencyCode())) {
            throw ConflictException.of(ErrorCode.WALLET_CURRENCY_MISMATCH, "error.parking.wallet.currencyMismatch");
        }
    }
}
