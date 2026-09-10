package cr.luparx.parking.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.UnprocessableEntityException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.parking.entity.ParkingPolicy;
import cr.luparx.parking.entity.ParkingRate;
import cr.luparx.parking.entity.ParkingSession;
import cr.luparx.parking.entity.ParkingSessionExtension;
import cr.luparx.parking.entity.ParkingSpace;
import cr.luparx.parking.entity.Vehicle;
import cr.luparx.core.money.Money;
import cr.luparx.parking.model.ExtensionOption;
import cr.luparx.parking.model.ParkingQuote;
import cr.luparx.parking.model.ZonePriceBook;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.model.PlateNormalizer;
import cr.luparx.parking.model.SessionVehicleRef;
import cr.luparx.parking.model.TimeCreditSource;
import cr.luparx.parking.model.VehicleType;
import cr.luparx.parking.model.WalletTransactionType;
import cr.luparx.parking.repository.ParkingSessionExtensionRepository;
import cr.luparx.parking.repository.ParkingSessionRepository;
import cr.luparx.parking.repository.ParkingSpaceRepository;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Starting, extending and finishing a parking session — the whole citizen flow of CONTRACT.md v0.2.
 *
 * <h2>What is guaranteed here</h2>
 *
 * <ul>
 *   <li><b>Charge and session are one transaction.</b> Every method that moves money is
 *       {@code @Transactional} and the wallet debit happens inside it, so the balance can never be
 *       debited without its session, nor a session exist without its charge.</li>
 *   <li><b>Credit before money.</b> The citizen's minutes are consumed first and only the rest is
 *       charged. If the wallet cannot cover the rest, the whole transaction rolls back:
 *       {@code INSUFFICIENT_BALANCE} and no session, no spent minutes, no debit.</li>
 *   <li><b>The offered options are the municipality's.</b> A duration that is not on the configured
 *       list is {@code INVALID_INCREMENT} — never silently rounded.</li>
 *   <li><b>Only charged time is charged.</b> Starting and extending price the minutes that fall
 *       inside the municipality's charging hours, in the municipality's own time zone; a stay with
 *       no chargeable minute at all is {@code OUTSIDE_CHARGING_HOURS} and says when charging
 *       resumes (CONTRACT.md v0.3, "Horario de cobro").</li>
 *   <li><b>Tenant comes from the context.</b> Every method takes the resolved {@link TenantId} of the
 *       request; nothing here accepts a tenant from a client parameter.</li>
 * </ul>
 *
 * <h2>Locking order</h2>
 *
 * <p>Two row locks are taken on the way through: the minute balance first, the wallet second, always
 * in that order and always inside one short transaction. A fixed order is what makes a deadlock
 * between two citizens' concurrent requests impossible.</p>
 *
 * <h2>Expiry without a scheduler</h2>
 *
 * <p>A session whose clock ran out past the municipality's grace is moved to {@code EXPIRED} the
 * next time anybody looks at that bay or that vehicle. Lazy expiry is idempotent and correct with
 * any number of instances; without it, the partial unique index would hold a bay for a session
 * nobody is paying for any more.</p>
 */
@Service
public class ParkingSessionService {

    private final ParkingSessionRepository sessionRepository;
    private final ParkingSessionExtensionRepository extensionRepository;
    private final ParkingSpaceRepository spaceRepository;
    private final ParkingPolicyService policyService;
    private final ParkingQuoteService quoteService;
    private final ParkingScheduleService scheduleService;
    private final ParkingSpaceFormatService spaceFormatService;
    private final VehicleService vehicleService;
    private final WalletService walletService;
    private final TimeCreditService timeCreditService;
    private final Clock clock;

    public ParkingSessionService(ParkingSessionRepository sessionRepository,
                                 ParkingSessionExtensionRepository extensionRepository,
                                 ParkingSpaceRepository spaceRepository,
                                 ParkingPolicyService policyService,
                                 ParkingQuoteService quoteService,
                                 ParkingScheduleService scheduleService,
                                 ParkingSpaceFormatService spaceFormatService,
                                 VehicleService vehicleService,
                                 WalletService walletService,
                                 TimeCreditService timeCreditService,
                                 Clock clock) {
        this.sessionRepository = sessionRepository;
        this.extensionRepository = extensionRepository;
        this.spaceRepository = spaceRepository;
        this.policyService = policyService;
        this.quoteService = quoteService;
        this.scheduleService = scheduleService;
        this.spaceFormatService = spaceFormatService;
        this.vehicleService = vehicleService;
        this.walletService = walletService;
        this.timeCreditService = timeCreditService;
        this.clock = clock;
    }

    // --- reads -----------------------------------------------------------------------------------

    /** The citizen's running sessions, soonest to expire first — the order the countdown bar needs. */
    @Transactional
    public List<ParkingSession> listActive(TenantId tenantId, UserId userId) {
        ParkingPolicy policy = policyService.require(tenantId);
        List<ParkingSession> active = sessionRepository.findByTenantIdAndUserIdAndStatusOrderByExpiresAtAsc(
                tenantId.value(), userId.value(), ParkingSessionStatus.ACTIVE);
        List<ParkingSession> stillRunning = new ArrayList<>(active.size());
        for (ParkingSession session : active) {
            if (!expireIfDue(session, policy)) {
                stillRunning.add(session);
            }
        }
        return stillRunning;
    }

    @Transactional(readOnly = true)
    public PageResponse<ParkingSession> listOwn(TenantId tenantId, UserId userId, ParkingSessionStatus status,
                                                PageRequest request) {
        org.springframework.data.domain.PageRequest pageable =
                org.springframework.data.domain.PageRequest.of(request.page(), request.size());
        Page<ParkingSession> page = status == null
                ? sessionRepository.findByTenantIdAndUserIdOrderByStartedAtDesc(tenantId.value(), userId.value(),
                        pageable)
                : sessionRepository.findByTenantIdAndUserIdAndStatusOrderByStartedAtDesc(tenantId.value(),
                        userId.value(), status, pageable);
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    /** @throws NotFoundException when the session is another citizen's or another municipality's */
    @Transactional(readOnly = true)
    public ParkingSession requireOwn(TenantId tenantId, UserId userId, UUID sessionId) {
        ParkingSession session = sessionRepository.findByTenantIdAndId(tenantId.value(), sessionId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.PARKING_SESSION_NOT_FOUND,
                        "error.parking.session.notFound"));
        if (!session.getUserId().equals(userId.value())) {
            // Same answer as "does not exist": a 403 here would confirm the identifier is real.
            throw NotFoundException.of(ErrorCode.PARKING_SESSION_NOT_FOUND, "error.parking.session.notFound");
        }
        return session;
    }

    /**
     * Every running session of one plate in this municipality — the inspector's lookup.
     *
     * <p>TODO(domain): this returns a LIST because plates are unique per user and not globally
     * (CONTRACT.md v0.2, rule 2), so two citizens may each have a running session for the same plate
     * in the same municipality. How the inspector app disambiguates is an open product decision: the
     * data is on the rows (zone and space), so filtering by the bay being inspected is the obvious
     * candidate, but "what the inspector sees" and "what counts as a verified stay when there are
     * two matches" are decisions for the product, not for this service. Returning the first match
     * would let a real infraction be excused by somebody else's session, so nothing is chosen here.
     */
    @Transactional
    public List<ParkingSession> findActiveByPlate(TenantId tenantId, String plateNormalized) {
        ParkingPolicy policy = policyService.require(tenantId);
        List<ParkingSession> matches = sessionRepository
                .findByTenantIdAndPlateSnapshotAndStatusOrderByExpiresAtAsc(tenantId.value(), plateNormalized,
                        ParkingSessionStatus.ACTIVE);
        List<ParkingSession> stillRunning = new ArrayList<>(matches.size());
        for (ParkingSession session : matches) {
            if (!expireIfDue(session, policy)) {
                stillRunning.add(session);
            }
        }
        return stillRunning;
    }

    @Transactional(readOnly = true)
    public List<ParkingSessionExtension> listExtensions(UUID sessionId) {
        return extensionRepository.findBySessionIdOrderByExtendedAtAsc(sessionId);
    }

    // --- start -----------------------------------------------------------------------------------

    /**
     * Starts a session: credit first, money for the rest, both with the session in one transaction.
     *
     * @param spaceCode the code painted on the bay, as the citizen typed it
     * @param vehicle which car this is for — one of theirs, or a plate typed for somebody else's
     *                (CONTRACT.md v0.11)
     * @param idempotencyKey the {@code Idempotency-Key} of the request, recorded for the audit trail;
     *                       replay protection itself belongs to the filter (ADR 0012)
     */
    @Transactional
    public ParkingSession start(TenantId tenantId, UserId userId, UUID zoneId, String spaceCode,
                                SessionVehicleRef vehicleRef, int minutes, String idempotencyKey) {
        ParkingPolicy policy = policyService.require(tenantId);
        // Read — and locked — before the duration is judged, because one of the durations a citizen
        // may ask for is exactly their saved minutes (CONTRACT.md v0.12), and the same number then
        // prices the stay below. Reading it twice would let the balance move in between and make the
        // check and the price disagree about what "all of it" means.
        int savedMinutes = timeCreditService.availableMinutesForUpdate(tenantId, userId);
        policyService.requireSessionIncrement(policy, minutes, savedMinutes);

        // Resolved to the two facts a stay actually records — the plate as it will be verified, and
        // what kind of vehicle it is. For a registered car they come from the record (so a citizen
        // cannot park a plate they never registered); for a borrowed one, from what they typed.
        UUID vehicleId = vehicleRef.vehicleId();
        String plate;
        VehicleType vehicleType;
        if (vehicleRef.isGuest()) {
            plate = requireValidPlate(vehicleRef.plate());
            vehicleType = vehicleRef.vehicleType();
        } else {
            Vehicle vehicle = vehicleService.requireOwn(userId, vehicleId);
            plate = vehicle.getPlateNormalized();
            vehicleType = vehicle.getType();
        }
        quoteService.requireActiveZone(tenantId, zoneId);
        // The code is checked against the municipality's own format BEFORE it is looked up, so a
        // shape that municipality never paints is refused as such instead of as "no such bay"
        // (CONTRACT.md v0.3, "Formato del código de espacio").
        ParkingSpace space = requireUsableSpace(tenantId, zoneId,
                spaceFormatService.requireValidCode(tenantId, spaceCode));

        // Free whatever the clock already ended, then refuse what is genuinely taken.
        releaseIfExpired(sessionRepository.findBySpaceIdAndStatus(space.getId(), ParkingSessionStatus.ACTIVE),
                policy);
        if (vehicleId != null) {
            releaseIfExpired(sessionRepository.findByVehicleIdAndStatus(vehicleId, ParkingSessionStatus.ACTIVE),
                    policy);
            if (sessionRepository.existsByVehicleIdAndStatus(vehicleId, ParkingSessionStatus.ACTIVE)) {
                throw ConflictException.of(ErrorCode.SESSION_ALREADY_ACTIVE_FOR_VEHICLE,
                        "error.parking.session.vehicleBusy");
            }
        }
        requirePlateFree(tenantId, policy, plate, vehicleRef.isGuest());
        if (sessionRepository.findBySpaceIdAndStatus(space.getId(), ParkingSessionStatus.ACTIVE).isPresent()) {
            throw ConflictException.of(ErrorCode.SPACE_OCCUPIED, "error.parking.space.occupied");
        }

        Instant now = clock.instant();
        ZonePriceBook prices = quoteService.requirePriceBook(tenantId, zoneId, now);
        int chargeable = requireChargeableWindow(tenantId, now, minutes);
        ParkingQuote quote = quoteService.price(prices, minutes, chargeable, savedMinutes);

        ParkingSession session = new ParkingSession(Uuid7.generate(), tenantId.value(), userId.value(),
                vehicleId, plate, vehicleType, zoneId, space.getId(), now,
                now.plusSeconds((long) minutes * 60L), quote.payable(), quote.creditMinutesApplied());
        // Flushed here so the partial unique indexes decide the race between two replicas now, while
        // the transaction can still be rolled back cleanly, rather than at commit.
        sessionRepository.saveAndFlush(session);

        if (quote.creditMinutesApplied() > 0) {
            timeCreditService.consume(tenantId, userId, quote.creditMinutesApplied(),
                    TimeCreditSource.SESSION_START, session.getId());
        }
        if (quote.payable().isPositive()) {
            // Throws INSUFFICIENT_BALANCE, which rolls back the session and the consumed minutes too.
            walletService.charge(tenantId, userId, quote.payable(), WalletTransactionType.SESSION_CHARGE,
                    session.getId(), idempotencyKey);
        }
        return session;
    }

    /**
     * The typed plate, normalised the same way a registered one is.
     *
     * <p>Deliberately the same rule and the same message as registering a vehicle: no country's
     * plate shape is validated (see {@link PlateNormalizer}), only that something usable is left
     * after normalising and that it fits. A plate typed to park a friend's car and a plate typed to
     * register your own are the same kind of input, and two different verdicts on the same text
     * would be a bug the citizen experiences as the app contradicting itself.</p>
     */
    private static String requireValidPlate(String typed) {
        String normalized = PlateNormalizer.normalize(typed);
        if (typed == null || !PlateNormalizer.isValid(normalized)
                || typed.trim().length() > PlateNormalizer.MAX_LENGTH) {
            throw new ValidationException("plate", ErrorCode.VALIDATION_FAILED,
                    "error.parking.vehicle.plate.invalid");
        }
        return normalized;
    }

    /**
     * Refuses a second running stay on the same plate in the same municipality — but only where the
     * platform can tell it is the same physical car.
     *
     * <p>A plate typed into the app is the car standing in front of the person typing it, so a
     * typed plate may not overlap with anything already running on that plate, and nothing already
     * running on a typed plate may be overlapped either. Between two <em>registered</em> vehicles
     * the rule stays as it was: plates are unique per citizen and not globally (CONTRACT.md v0.2,
     * rule 2), two people may legitimately have the same plate on file, and narrowing that here
     * would refuse stays that have always been allowed.</p>
     *
     * <p>Expired-but-not-yet-closed stays are released first, exactly as the bay is: a car whose
     * time ran out an hour ago must not block the next payment for it.</p>
     */
    private void requirePlateFree(TenantId tenantId, ParkingPolicy policy, String plate, boolean startingGuest) {
        List<ParkingSession> onPlate = sessionRepository
                .findByTenantIdAndPlateSnapshotAndStatusOrderByExpiresAtAsc(tenantId.value(), plate,
                        ParkingSessionStatus.ACTIVE);
        for (ParkingSession running : onPlate) {
            if (expireIfDue(running, policy)) {
                continue;
            }
            if (startingGuest || running.isGuestVehicle()) {
                throw ConflictException.of(ErrorCode.SESSION_ALREADY_ACTIVE_FOR_PLATE,
                        "error.parking.session.plateBusy");
            }
        }
    }

    // --- extend ----------------------------------------------------------------------------------

    /**
     * Adds time to a running session, charged at the zone's current tariff.
     *
     * @throws ConflictException {@code EXTENSION_DISABLED} when the municipality does not allow it
     * @throws UnprocessableEntityException {@code INVALID_INCREMENT} for an option not offered, or
     *         {@code EXTENSION_EXCEEDS_MAX} when the total would pass the configured cap
     */
    @Transactional
    public ParkingSession extend(TenantId tenantId, UserId userId, UUID sessionId, int minutes,
                                 String idempotencyKey) {
        ParkingPolicy policy = policyService.require(tenantId);
        if (!policy.isExtensionEnabled()) {
            throw ConflictException.of(ErrorCode.EXTENSION_DISABLED, "error.parking.extension.disabled");
        }
        ParkingSession session = requireOwn(tenantId, userId, sessionId);
        if (expireIfDue(session, policy) || !session.getStatus().isActive()) {
            throw ConflictException.of(ErrorCode.PARKING_SESSION_NOT_ACTIVE, "error.parking.session.notActive");
        }
        policyService.requireExtensionIncrement(policy, minutes);

        int totalAfter = session.bookedMinutes() + minutes;
        if (totalAfter > policy.getExtensionMaxTotalMinutes()) {
            throw UnprocessableEntityException.of(ErrorCode.EXTENSION_EXCEEDS_MAX,
                    "error.parking.extension.exceedsMax", Integer.valueOf(policy.getExtensionMaxTotalMinutes()));
        }

        Instant now = clock.instant();
        ZonePriceBook prices = quoteService.requirePriceBook(tenantId, session.getZoneId(), now);
        // An extension adds time to the END of the session, so what it costs is decided by the
        // charging hours of the stretch it adds — not by the hours at the moment the button is
        // pressed. Extending a 17:30 session at 17:55 buys 18:00-19:00, which is free.
        int chargeable = requireChargeableWindow(tenantId, session.getExpiresAt(), minutes);
        int available = timeCreditService.availableMinutesForUpdate(tenantId, userId);
        ParkingQuote quote = quoteService.price(prices, minutes, chargeable, available);

        session.extend(minutes, quote.payable(), quote.creditMinutesApplied(), now);
        sessionRepository.save(session);
        extensionRepository.save(new ParkingSessionExtension(Uuid7.generate(), tenantId.value(), session.getId(),
                minutes, quote.payable(), quote.creditMinutesApplied(), now, idempotencyKey));

        if (quote.creditMinutesApplied() > 0) {
            timeCreditService.consume(tenantId, userId, quote.creditMinutesApplied(), TimeCreditSource.EXTENSION,
                    session.getId());
        }
        if (quote.payable().isPositive()) {
            walletService.charge(tenantId, userId, quote.payable(), WalletTransactionType.EXTENSION_CHARGE,
                    session.getId(), idempotencyKey);
        }
        return session;
    }

    /**
     * Every extension the municipality offers for this session, each with its price already worked
     * out and the expiry it would produce.
     *
     * <p>One call instead of a quote per option. Beyond the round trips saved, it is the only way the
     * numbers can be consistent: priced one at a time, each option is computed at a different instant
     * and against a possibly different charging band, so a list assembled that way can show two prices
     * that were never simultaneously true.</p>
     *
     * <p>Every option is priced from the session's CURRENT expiry, because that is where the time it
     * buys begins — extending at 17:55 a session that runs to 18:30 buys 18:30 onwards, and if the
     * municipality stops charging at 18:00 that time is free. The credit balance is read once and
     * applied to each option independently: they are alternatives, not a basket, and the citizen will
     * take at most one.</p>
     *
     * <p>Read-only. Nothing is reserved, no minute is consumed and no money moves; the extension
     * itself re-computes everything inside its own transaction, because a list the client held on to
     * for a minute is a display and not a promise.</p>
     *
     * @throws ConflictException {@code EXTENSION_DISABLED} when the municipality does not allow
     *         extending at all, and {@code PARKING_SESSION_NOT_ACTIVE} when the stay is over
     */
    @Transactional
    public List<ExtensionOption> extensionOptions(TenantId tenantId, UserId userId, UUID sessionId) {
        ParkingPolicy policy = policyService.require(tenantId);
        if (!policy.isExtensionEnabled()) {
            throw ConflictException.of(ErrorCode.EXTENSION_DISABLED, "error.parking.extension.disabled");
        }
        ParkingSession session = requireOwn(tenantId, userId, sessionId);
        if (expireIfDue(session, policy) || !session.getStatus().isActive()) {
            throw ConflictException.of(ErrorCode.PARKING_SESSION_NOT_ACTIVE, "error.parking.session.notActive");
        }

        Instant now = clock.instant();
        ZonePriceBook prices = quoteService.requirePriceBook(tenantId, session.getZoneId(), now);
        int credit = timeCreditService.availableMinutes(tenantId, userId);
        Money balance = walletService.balance(tenantId, userId);
        Instant from = session.getExpiresAt();

        List<Integer> offered = policy.extensionIncrements().values();
        List<ExtensionOption> options = new ArrayList<>(offered.size());
        for (Integer minutes : offered) {
            int added = minutes.intValue();
            int chargeable = quoteService.chargeableMinutes(tenantId, from, added);
            ParkingQuote quote = quoteService.price(prices, added, chargeable, credit);
            Instant newExpiresAt = from.plusSeconds((long) added * 60L);
            if (session.bookedMinutes() + added > policy.getExtensionMaxTotalMinutes()) {
                options.add(ExtensionOption.unavailable(added, quote, newExpiresAt,
                        ErrorCode.EXTENSION_EXCEEDS_MAX));
            } else if (quote.payable().isPositive() && balance.compareTo(quote.payable()) < 0) {
                options.add(ExtensionOption.unavailable(added, quote, newExpiresAt,
                        ErrorCode.INSUFFICIENT_BALANCE));
            } else {
                options.add(ExtensionOption.available(added, quote, newExpiresAt));
            }
        }
        return options;
    }

    // --- finish ----------------------------------------------------------------------------------

    /**
     * Closes a session. The minutes left over come back as credit if the municipality says so; money
     * never does (CONTRACT.md v0.2, rule 5), and only the ones that were actually charged for come
     * back at all (CONTRACT.md v0.3, "Horario de cobro").
     *
     * @throws ConflictException {@code EARLY_FINISH_DISABLED} when the municipality does not allow
     *         closing a session that still has time on it. Note that a session whose clock has
     *         already run out can always be closed: refusing there would leave the bay held by a
     *         session nobody is paying for, which serves nobody.
     */
    @Transactional
    public ParkingSession finish(TenantId tenantId, UserId userId, UUID sessionId) {
        ParkingPolicy policy = policyService.require(tenantId);
        ParkingSession session = requireOwn(tenantId, userId, sessionId);
        if (!session.getStatus().isActive()) {
            throw ConflictException.of(ErrorCode.PARKING_SESSION_NOT_ACTIVE, "error.parking.session.notActive");
        }
        Instant now = clock.instant();
        int remaining = session.remainingMinutesAt(now);
        if (remaining > 0 && !policy.isEarlyFinishEnabled()) {
            throw ConflictException.of(ErrorCode.EARLY_FINISH_DISABLED, "error.parking.earlyFinish.disabled");
        }
        // Only PAID time comes back. Since v0.3 a stay can cover minutes the municipality does not
        // charge for, and crediting those would hand the citizen minutes they never bought: a session
        // started at 17:30 for ninety minutes pays for thirty, so finishing it at 17:45 gives back
        // fifteen, not seventy-five.
        int creditable = remaining <= 0
                ? 0
                : Math.min(remaining, quoteService.chargeableMinutes(tenantId, now, remaining));
        if (policy.isCreditOnEarlyFinishEnabled() && creditable > 0
                && creditable >= policy.getCreditMinRemainingMinutes()) {
            // At or above the threshold, not strictly above: a municipality that configures 10 means
            // "ten minutes are worth keeping", and losing exactly ten would be the surprise.
            timeCreditService.grant(tenantId, userId, creditable, TimeCreditSource.EARLY_FINISH,
                    session.getId(), policy.getCreditExpiryDays());
        }
        session.finish(now);
        return sessionRepository.save(session);
    }

    // --- helpers ---------------------------------------------------------------------------------

    /**
     * The chargeable minutes of a stretch that is about to be bought, refusing the ones that are
     * entirely outside the municipality's charging hours.
     *
     * <p>The refusal is deliberate and it is narrow: only a stretch with <em>no</em> chargeable minute
     * at all is refused. A stay that starts at 17:30 and runs past closing is perfectly normal and is
     * simply charged for the part inside the hours. Refusing it would tell a citizen who is legitimately
     * parking that they may not — and letting the other case through would open a session nobody is
     * paying for and hold a bay for it.</p>
     *
     * @throws ConflictException {@code OUTSIDE_CHARGING_HOURS}, carrying when charging next resumes so
     *         the app can say it in words ("charging resumes on Monday at 7:00")
     */
    private int requireChargeableWindow(TenantId tenantId, Instant from, int minutes) {
        int chargeable = quoteService.chargeableMinutes(tenantId, from, minutes);
        if (chargeable > 0) {
            return chargeable;
        }
        Instant next = scheduleService.nextChargingStart(tenantId, from).orElse(null);
        throw ConflictException.of(ErrorCode.OUTSIDE_CHARGING_HOURS, "error.parking.schedule.outsideHours",
                next == null ? "-" : next.toString());
    }

    private ParkingSpace requireUsableSpace(TenantId tenantId, UUID zoneId, String spaceCode) {
        String code = spaceCode == null ? "" : spaceCode.trim();
        ParkingSpace space = spaceRepository.findByTenantIdAndCode(tenantId.value(), code)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.PARKING_SPACE_NOT_FOUND,
                        "error.parking.space.notFound"));
        if (!space.getZoneId().equals(zoneId)) {
            // The bay exists but not in the zone the citizen said. Same answer as "not found": the
            // citizen mistyped one of the two, and telling them which one would map the municipality
            // for anyone probing.
            throw NotFoundException.of(ErrorCode.PARKING_SPACE_NOT_FOUND, "error.parking.space.notFound");
        }
        if (!space.getStatus().isUsable()) {
            throw ConflictException.of(ErrorCode.PARKING_SPACE_OUT_OF_SERVICE, "error.parking.space.outOfService");
        }
        return space;
    }

    private void releaseIfExpired(Optional<ParkingSession> session, ParkingPolicy policy) {
        session.ifPresent(found -> expireIfDue(found, policy));
    }

    /**
     * Moves a session to {@code EXPIRED} when its clock ran out past the municipality's grace.
     *
     * @return true when this call expired it, so the caller can drop it from a list of running ones
     */
    private boolean expireIfDue(ParkingSession session, ParkingPolicy policy) {
        Instant now = clock.instant();
        if (!session.getStatus().isActive() || !session.isExpiredAt(now, policy.getGraceMinutes())) {
            return false;
        }
        session.expire(now);
        sessionRepository.saveAndFlush(session);
        return true;
    }
}
