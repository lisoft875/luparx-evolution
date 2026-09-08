package cr.luparx.app.web.dto;

import cr.luparx.core.page.PageResponse;
import cr.luparx.parking.model.ParkingSessionStatus;
import cr.luparx.parking.model.TimeCreditSource;
import cr.luparx.parking.model.WalletTransactionType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
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
            Boolean isOwner) {
    }

    /**
     * A registered vehicle. {@code plate} is what the citizen typed and {@code plateNormalized} is
     * what the platform matches on; both are returned so the app can show one and compare the other.
     */
    public record VehicleResponse(
            UUID id,
            String plate,
            String plateNormalized,
            String name,
            String brand,
            String model,
            Integer year,
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
            MoneyDto amount,
            int creditMinutesApplied,
            int payableMinutes,
            MoneyDto payable) {
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
}
