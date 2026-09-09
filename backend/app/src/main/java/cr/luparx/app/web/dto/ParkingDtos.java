package cr.luparx.app.web.dto;

import cr.luparx.core.page.PageResponse;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.model.ParkingSpaceStatus;
import cr.luparx.parking.model.TimeCreditSource;
import cr.luparx.parking.model.WalletTransactionType;
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

    /** The price of a zone as a citizen reads it: an exact amount per block of minutes. */
    public record ParkingRateSummary(MoneyDto amount, int minutes) {
    }

    // --- sessions --------------------------------------------------------------------------------

    /** {@code POST /citizen/parking/sessions}. Requires an {@code Idempotency-Key} header. */
    public record StartSessionRequest(
            @NotNull UUID zoneId,
            @NotBlank @Size(max = 16) String spaceCode,
            @NotNull UUID vehicleId,
            @NotNull @Min(1) Integer minutes) {
    }

    /** {@code POST /citizen/parking/sessions/{id}/extend}. Requires an {@code Idempotency-Key}. */
    public record ExtendSessionRequest(@NotNull @Min(1) Integer minutes) {
    }

    /**
     * A stay. {@code plateSnapshot} is the plate as it was when the session started — what the
     * inspector verifies against — and not necessarily what the vehicle carries today.
     */
    public record ParkingSessionResponse(
            UUID id,
            UUID vehicleId,
            String plateSnapshot,
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

    /** {@code GET /citizen/wallet} — the balance in THIS municipality; there is no global one. */
    public record WalletResponse(MoneyDto balance, PageResponse<WalletTransactionResponse> transactions) {
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
            MoneyDto amount,
            int minutes,
            Instant validFrom,
            Instant validTo) {
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
