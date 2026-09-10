package cr.luparx.app.web.dto;

import cr.luparx.core.page.PageResponse;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.model.ParkingSpaceStatus;
import cr.luparx.parking.model.TimeCreditSource;
import cr.luparx.parking.model.VehicleType;
import cr.luparx.parking.model.WalletTransactionType;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Wire shapes of the parking domain (CONTRACT.md "v0.2 — Dominio de parqueo").
 *
 * <p>Explicit records rather than serialised entities: the mapping is where data minimisation is
 * decided and where the contract stops being an accident of the schema (CONTRACT.md §4).</p>
 *
 * <p><b>Money never travels as a decimal.</b> Every amount is a {@link MoneyDto} — integer minor
 * units plus its ISO 4217 code — so no client has to guess the currency and no JSON number ever
 * loses a cent (ADR 0009). Formatting is the client's job, with the locale it already knows.</p>
 *
 * <p><b>Minutes are not money and never appear as one.</b> Time credit is expressed in minutes
 * everywhere, because that is what it is: it is spent on parking, it is not refunded and it does not
 * cross municipalities (CONTRACT.md v0.2, rule 5).</p>
 */
public final class ParkingDtos {

    private ParkingDtos() {
    }

    /** An exact amount on the wire. Integer minor units; a decimal string would invite rounding. */
    public record MoneyDto(long amountMinor, String currencyCode) {
    }

    // --- vehicles --------------------------------------------------------------------------------

    /** {@code POST /citizen/vehicles}. Only the plate is required (CONTRACT.md v0.2, "Vehículos"). */
    public record CreateVehicleRequest(
            @NotBlank @Size(max = 16) String plate,
            @Size(max = 80) String name,
            @Size(max = 80) String brand,
            @Size(max = 80) String model,
            @Min(1885) @Max(2200) Integer year,
            // Keys from the catalogues at GET /catalog/vehicle-types and /catalog/vehicle-colors.
            // Absent type means the ordinary case (a car); absent colour means "not said".
            @Size(max = 32) String type,
            @Size(max = 32) String color,
            Boolean isOwner,
            Boolean isPrimary) {
    }

    /** {@code PUT /citizen/vehicles/{id}}. */
    public record UpdateVehicleRequest(
            @NotBlank @Size(max = 16) String plate,
            @Size(max = 80) String name,
            @Size(max = 80) String brand,
            @Size(max = 80) String model,
            @Min(1885) @Max(2200) Integer year,
            @Size(max = 32) String type,
            @Size(max = 32) String color,
            Boolean isOwner) {
    }

    /**
     * A registered vehicle. {@code plate} is what the citizen typed and {@code plateNormalized} is
     * what the platform matches on; both are returned so the app can show one and compare the other.
     */
    /**
     * A registered vehicle.
     *
     * <p>{@code type} and {@code color} are catalogue KEYS and {@code typeLabelKey} /
     * {@code colorLabelKey} are the i18n keys to render them with. Both travel because they answer
     * different questions: the key is what a client filters and compares by, the label key is what it
     * prints — and printing a translated word the server chose would break the moment the citizen and
     * the inspector read different languages.</p>
     *
     * <p>{@code color} is null when the citizen has not said, which is a real answer and not a gap to
     * paper over.</p>
     */
    public record VehicleResponse(
            UUID id,
            String plate,
            String plateNormalized,
            String name,
            String brand,
            String model,
            Integer year,
            String type,
            String typeLabelKey,
            String color,
            String colorLabelKey,
            boolean isOwner,
            boolean isPrimary,
            Instant createdAt) {
    }

    // --- policy ----------------------------------------------------------------------------------

    /** {@code GET /citizen/parking/policy} and {@code GET /admin/parking/policy}. */
    public record ParkingPolicyResponse(
            List<Integer> sessionIncrementsMinutes,
            int sessionMinMinutes,
            int sessionMaxMinutes,
            boolean extensionEnabled,
            List<Integer> extensionIncrementsMinutes,
            int extensionMaxTotalMinutes,
            boolean earlyFinishEnabled,
            boolean creditOnEarlyFinishEnabled,
            int creditMinRemainingMinutes,
            int creditExpiryDays,
            int graceMinutes,
            Instant updatedAt) {
    }

    /** {@code PUT /admin/parking/policy} — the whole policy, replaced as one form. */
    public record UpdateParkingPolicyRequest(
            @NotNull List<Integer> sessionIncrementsMinutes,
            @NotNull @Min(1) Integer sessionMinMinutes,
            @NotNull @Min(1) Integer sessionMaxMinutes,
            @NotNull Boolean extensionEnabled,
            List<Integer> extensionIncrementsMinutes,
            @NotNull @Min(1) Integer extensionMaxTotalMinutes,
            @NotNull Boolean earlyFinishEnabled,
            @NotNull Boolean creditOnEarlyFinishEnabled,
            @NotNull @Min(0) Integer creditMinRemainingMinutes,
            @NotNull @Min(0) Integer creditExpiryDays,
            @NotNull @Min(0) Integer graceMinutes) {
    }

    // --- quote -----------------------------------------------------------------------------------

    /** {@code POST /citizen/parking/quote}. */
    public record QuoteRequest(@NotNull UUID zoneId, @NotNull @Min(1) Integer minutes) {
    }

    /**
     * {@code amount} is the full price of the stay, {@code payable} is what will actually leave the
     * wallet once the citizen's minutes are applied. {@code payable} is not {@code amount} minus a
     * converted credit: the remaining minutes are priced on their own, per started tariff block.
     */
    public record QuoteResponse(
            int minutes,
            int chargeableMinutes,
            MoneyDto amount,
            int creditMinutesApplied,
            int payableMinutes,
            MoneyDto payable) {
    }

    // --- zones the citizen may park in -----------------------------------------------------------

    /**
     * {@code GET /citizen/parking/zones} — the zones of the active municipality that are still
     * operated, with the tariff in force in each.
     *
     * <p>This is what a citizen picks from before asking for a quote or starting a session, both of
     * which take a {@code zoneId}. It is a separate shape from the admin
     * {@link ParkingZoneResponse}: a citizen has no business seeing whether a zone is active (only
     * active ones are listed at all) or how many bays it holds, and they do need the price, which the
     * admin listing does not carry.</p>
     *
     * <p>{@code rate} is null when the zone has no open tariff window. That is not a free zone — it
     * is a misconfigured one — and starting a session there answers {@code PARKING_RATE_NOT_FOUND},
     * so a client should show it as unavailable rather than as costing nothing.</p>
     */
    public record CitizenParkingZoneResponse(
            UUID id,
            String code,
            String name,
            String description,
            ParkingRateSummary rate,
            SpaceCodeRange spaceCodes) {
    }

    /**
     * Which bay codes a zone actually has, so the app can say "0001–0500" under the field instead of
     * letting a citizen guess and be told the code does not exist.
     *
     * <p>The bays of a zone are dealt in one contiguous block, so first and last describe the range
     * exactly; {@code count} is there because a range does not say whether anything was retired out of
     * the middle. Null when the zone has no bays at all — a zone drawn on a map before it was painted,
     * which is a valid state and not something to render as "0–0".</p>
     */
    public record SpaceCodeRange(String first, String last, long count) {
    }

    /**
     * The price of a zone as a citizen reads it: the base, plus the price of every duration the
     * municipality sells (CONTRACT.md v0.24).
     *
     * <p>{@code durations} is what the picker renders. It is priced here, by the server, for the
     * same reason the reference platform states in its own DTO: a client that computed "30 minutes
     * is twice 15" would be wrong in every municipality with a non-linear ladder, and those are most
     * of them.</p>
     */
    public record ParkingRateSummary(MoneyDto amount, int minutes, List<DurationPrice> durations) {
    }

    /** One entry of the picker: a duration the municipality sells and what it costs. */
    public record DurationPrice(int minutes, MoneyDto amount) {
    }

    // --- sessions --------------------------------------------------------------------------------

    /**
     * {@code POST /citizen/parking/sessions}. Requires an {@code Idempotency-Key} header.
     *
     * <p>Exactly one of {@code vehicleId} and {@code plate} is sent. The first is a vehicle the
     * citizen registered; the second is somebody else's car, typed on the spot and saved nowhere
     * but on the stay (CONTRACT.md v0.11) — {@code vehicleType} accompanies it, because for a
     * borrowed car this request is the only place that fact exists. Sending both, or neither, is
     * refused as a validation error rather than resolved by precedence: a client that means one
     * thing and sends two is a client with a bug, and picking a winner would hide it.</p>
     */
    public record StartSessionRequest(
            @NotNull UUID zoneId,
            @NotBlank @Size(max = 16) String spaceCode,
            UUID vehicleId,
            @Size(max = 16) String plate,
            VehicleType vehicleType,
            @NotNull @Min(1) Integer minutes) {

        @AssertTrue(message = "exactly one of vehicleId and plate must be given")
        public boolean isExactlyOneVehicleGiven() {
            return (vehicleId != null) ^ (plate != null && !plate.isBlank());
        }
    }

    /** {@code POST /citizen/parking/sessions/{id}/extend}. Requires an {@code Idempotency-Key}. */
    public record ExtendSessionRequest(@NotNull @Min(1) Integer minutes) {
    }

    /**
     * One entry of {@code GET /citizen/parking/sessions/{id}/extension-options}: a duration the
     * municipality offers, already priced, with the expiry it would produce.
     *
     * <p>It exists so the screen that offers extensions can show a price next to each option without
     * a quote per option — three round trips to draw one list, each answering at a different instant.
     *
     * <p>{@code chargeableMinutes} is smaller than {@code minutes} when the extension runs past the
     * municipality's closing time; an option entirely outside the charging hours costs nothing and is
     * still offered, because the citizen genuinely may park for it.</p>
     *
     * <p>{@code allowed} false with {@code unavailableReason} — {@code EXTENSION_EXCEEDS_MAX} or
     * {@code INSUFFICIENT_BALANCE} — instead of dropping the entry: a list that silently loses its
     * last option teaches the citizen nothing.</p>
     */
    public record ExtensionOptionResponse(
            int minutes,
            int chargeableMinutes,
            MoneyDto amount,
            int creditMinutesApplied,
            int payableMinutes,
            MoneyDto payable,
            Instant newExpiresAt,
            boolean allowed,
            String unavailableReason) {
    }

    /**
     * A stay. {@code plateSnapshot} is the plate as it was when the session started — what the
     * inspector verifies against — and not necessarily what the vehicle carries today.
     *
     * <p>{@code vehicleId} is null for a stay opened with a typed plate: the citizen parked
     * somebody else's car and there is no vehicle of theirs behind it. {@code plateSnapshot} and
     * {@code vehicleType} are always present, so nothing on screen has to branch on that.</p>
     */
    public record ParkingSessionResponse(
            UUID id,
            UUID vehicleId,
            String plateSnapshot,
            VehicleType vehicleType,
            UUID zoneId,
            String zoneName,
            UUID spaceId,
            String spaceCode,
            Instant startedAt,
            Instant expiresAt,
            Instant endedAt,
            ParkingSessionStatus status,
            int bookedMinutes,
            int remainingMinutes,
            MoneyDto amount,
            int creditMinutesApplied) {
    }

    /** One extension of a session, as the citizen's receipt shows it. */
    public record ParkingSessionExtensionResponse(
            UUID id,
            int minutes,
            MoneyDto amount,
            int creditMinutesApplied,
            Instant extendedAt) {
    }

    /** {@code GET /citizen/parking/sessions/{id}} — the stay plus what was added to it. */
    public record ParkingSessionDetailResponse(
            ParkingSessionResponse session,
            List<ParkingSessionExtensionResponse> extensions) {
    }

    // --- wallet ----------------------------------------------------------------------------------

    /**
     * {@code GET /citizen/wallet} — the balance in THIS municipality; there is no global one.
     *
     * <p>{@code topupCode} travels with it because that is where a citizen looks for it: the code is
     * what they read out at a till to have this same balance credited (CONTRACT.md v0.8).</p>
     */
    public record WalletResponse(MoneyDto balance, TopupCodeResponse topupCode,
                                 PageResponse<WalletTransactionResponse> transactions) {
    }

    /**
     * The code a citizen dictates at a counter.
     *
     * <p>Both forms travel: {@code code} is what the client sends back and compares, {@code display}
     * is the grouped form a person reads aloud. The client must not invent the grouping itself — the
     * server owns the format, so changing it later does not need every app to be updated.</p>
     */
    public record TopupCodeResponse(String code, String display, Instant createdAt, Instant rotatedAt) {
    }

    /**
     * What a till gets back when it resolves a dictated code: <b>only</b> enough to confirm out loud
     * that it is the right person. No balance, no email, no telephone, no document — a cashier
     * confirming a name does not need, and must not be shown, the account behind it.
     */
    public record TopupCodeResolutionResponse(String givenName, String familyInitial, String tenantName,
                                              String currencyCode) {
    }

    /** {@code POST /admin/wallets/topups} — crediting a wallet at the municipality's own counter. */
    public record AdminTopupRequest(
            @Size(max = 20) String topupCode,
            UUID userId,
            @NotNull @Min(1) Long amountMinor,
            @Size(max = 120) String externalReference,
            @Size(max = 200) String note) {
    }

    /** {@code POST /citizen/wallet/topups} — the development shortcut, dev profile only. */
    public record DevTopupRequest(@NotNull @Min(1) Long amountMinor) {
    }

    /** The movement a top-up produced, with the balance it left behind. */
    public record TopupResponse(UUID transactionId, MoneyDto amount, MoneyDto balanceAfter, String source,
                                String externalReference, Instant createdAt, boolean alreadyApplied) {
    }

    /** Signed: a negative amount is money that left the wallet. */
    public record WalletTransactionResponse(
            UUID id,
            WalletTransactionType type,
            MoneyDto amount,
            MoneyDto balanceAfter,
            UUID sessionId,
            Instant createdAt) {
    }

    // --- time credits ----------------------------------------------------------------------------

    /** {@code GET /citizen/time-credits} — minutes to the citizen's favour, and when they lapse. */
    public record TimeCreditResponse(
            int balanceMinutes,
            List<TimeCreditLotResponse> lots) {
    }

    /** One batch of minutes still unspent. {@code expiresAt} null means these minutes never lapse. */
    public record TimeCreditLotResponse(
            UUID id,
            TimeCreditSource source,
            int minutes,
            int remainingMinutes,
            UUID sessionId,
            Instant expiresAt,
            Instant createdAt) {
    }

    // --- admin zones and rates -------------------------------------------------------------------

    /** {@code GET /admin/parking/zones}. */
    public record ParkingZoneResponse(
            UUID id,
            String code,
            String name,
            String description,
            UUID divisionId,
            boolean active,
            long spaceCount) {
    }

    /** {@code PUT /admin/parking/zones/{id}}. */
    /**
     * {@code POST /admin/parking/zones} — a new sector of the municipality (CONTRACT.md v0.16).
     *
     * <p>The code is here and absent from the update request, and that asymmetry is deliberate: it is
     * the zone's identity for every report, every radio call and every bay that belongs to it.</p>
     */
    public record CreateParkingZoneRequest(
            @NotBlank @Size(max = 32) String code,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 500) String description,
            UUID divisionId) {
    }

    /**
     * {@code PUT /admin/parking/spaces/{id}} — take a bay out of service, put it back, move it to
     * another zone, or correct its code.
     *
     * <p>Every field is optional and only the ones present are applied, so a client that only knows
     * about status keeps working unchanged. {@code code} is the bay's number as painted: correcting
     * it changes the bay from today onwards and never the stays and citations already issued on it,
     * which carry their own copy (CONTRACT.md v0.25).</p>
     */
    public record UpdateParkingSpaceRequest(
            ParkingSpaceStatus status,
            UUID zoneId,
            @Size(max = 16) String code) {
    }

    public record UpdateParkingZoneRequest(
            @NotBlank @Size(max = 160) String name,
            @Size(max = 400) String description,
            UUID divisionId,
            @NotNull Boolean active) {
    }

    /** {@code GET /admin/parking/rates}. A closed window is history, not a mistake. */
    public record ParkingRateResponse(
            UUID id,
            UUID zoneId,
            /** {@code BLOCK} = the zone's linear base; {@code EXACT} = one rung of its ladder. */
            String kind,
            MoneyDto amount,
            int minutes,
            Instant validFrom,
            Instant validTo) {
    }

    /** {@code PUT /admin/parking/rates/rungs} — prices one exact duration (CONTRACT.md v0.24). */
    public record SetRateRungRequest(
            @NotNull UUID zoneId,
            @NotNull @Min(0) Long amountMinor,
            @NotNull @Min(1) Integer minutes) {
    }

    /**
     * {@code PUT /admin/parking/rates} — sets the tariff in force for a zone.
     *
     * <p>It closes the current window and opens a new one rather than editing a row: a rate that was
     * charged must stay readable exactly as it was charged, or a receipt stops matching the ledger.</p>
     */
    public record UpdateParkingRateRequest(
            @NotNull UUID zoneId,
            @NotNull @Min(0) Long amountMinor,
            @NotNull @Min(1) Integer minutes) {
    }

    // --- bays ------------------------------------------------------------------------------------

    /** {@code POST /admin/parking/spaces}. The code is validated against the municipality's format. */
    public record CreateParkingSpaceRequest(
            @NotNull UUID zoneId,
            @NotBlank @Size(max = 16) String code) {
    }

    /** A bay as the admin portal shows it. */
    public record ParkingSpaceResponse(UUID id, UUID zoneId, String code, ParkingSpaceStatus status) {
    }

    // --- bay code format (CONTRACT.md v0.3) -------------------------------------------------------

    /**
     * {@code GET /admin/parking/space-format} and the shape the citizen app reads.
     *
     * <p>{@code pattern} is the effective regular expression — the app validates with it while the
     * citizen types, and the server validates with the same string — and {@code example} is the
     * placeholder to show. The three parts above them are what the form edits.</p>
     */
    public record ParkingSpaceFormatResponse(
            String prefix,
            int digits,
            boolean allowLetters,
            String pattern,
            String example,
            Instant updatedAt) {
    }

    /**
     * {@code PUT /admin/parking/space-format}.
     *
     * <p>Leave {@code pattern} and {@code example} out and both are derived from the parts, which is
     * what "four digits, no prefix" means. Send a {@code pattern} and it is taken as written — for a
     * numbering the form cannot express — but the example must still match it.</p>
     */
    public record UpdateParkingSpaceFormatRequest(
            @Size(max = 8) String prefix,
            @NotNull @Min(1) @Max(12) Integer digits,
            @NotNull Boolean allowLetters,
            @Size(max = 200) String pattern,
            @Size(max = 32) String example) {
    }

    // --- charging schedule (CONTRACT.md v0.3) -----------------------------------------------------

    /**
     * One charging band, in LOCAL minutes from midnight in the municipality's own time zone.
     *
     * <p>Minutes and not {@code "HH:mm"} because a band has to be able to close the day: 1440 says
     * "midnight at the end of this day" and no wall-clock string does. {@code startsAt}/{@code endsAt}
     * travel alongside as {@code HH:mm} for display, with {@code endsAt} null when the band closes
     * the day.</p>
     */
    public record ChargingBandDto(
            @Min(0) @Max(1439) int startMinute,
            @Min(1) @Max(1440) int endMinute,
            String startsAt,
            String endsAt) {
    }

    /** The bands of one weekday. A weekday with no band is a day this municipality does not charge. */
    public record ChargingDayDto(DayOfWeek weekday, List<ChargingBandDto> bands) {
    }

    /**
     * A dated exception.
     *
     * @param date          local date in the municipality's zone
     * @param charges       false — the usual case — is a holiday: nothing is charged that day
     * @param chargesAllDay that day is charged around the clock
     * @param label         tenant content naming it; never a translated label
     * @param bands         its own bands; empty means "as usual", i.e. the weekday bands
     */
    public record ChargingExceptionDto(
            @NotNull LocalDate date,
            @NotNull Boolean charges,
            Boolean chargesAllDay,
            @Size(max = 120) String label,
            List<ChargingBandDto> bands) {
    }

    /** {@code GET /admin/parking/schedule} and {@code GET /citizen/parking/schedule}. */
    public record ParkingScheduleResponse(
            String timeZone,
            boolean chargesAllDay,
            List<ChargingDayDto> week,
            List<ChargingExceptionDto> exceptions,
            boolean chargingNow,
            Instant nextChargingStartsAt,
            Instant updatedAt) {
    }

    /** {@code PUT /admin/parking/schedule} — the whole timetable, replaced as one form. */
    public record UpdateParkingScheduleRequest(
            @NotNull Boolean chargesAllDay,
            List<ChargingDayDto> week,
            List<ChargingExceptionDto> exceptions) {
    }
}
