package cr.luparx.app.web.dto;

import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.ExemptionStatus;
import cr.luparx.enforcement.model.PlateVerdict;
import cr.luparx.parking.model.PaymentStatus;
import cr.luparx.parking.model.WalletTransactionType;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Wire shapes of {@code GET /api/v1/admin/dashboard} (CONTRACT.md v0.36).
 *
 * <p>Every group carries its <b>enumerated value</b> and not a translated word, so the client can
 * both label it and use it as a filter. That is what turns each figure into a link: the screen it
 * opens is the same list, filtered by the very value the number was counted from — which is the
 * difference between a dashboard somebody can check and one they can only look at.</p>
 */
public final class DashboardDtos {

    private DashboardDtos() {
    }

    /**
     * @param now the moment the live blocks refer to. Sent so the screen can say it out loud: a
     *            figure that is live and one that covers a month must not look alike
     */
    public record DashboardResponse(Instant from, Instant to, Instant now,
                                    RevenueBlock revenue,
                                    List<TransactionGroupDto> transactions,
                                    List<ParkingGroupDto> parking,
                                    OccupancyBlock occupancy,
                                    List<VerdictGroupDto> checks,
                                    List<CitationGroupDto> citations,
                                    List<ExemptionGroupDto> exemptions,
                                    List<InspectorActivityDto> inspectors,
                                    PaymentFailuresBlock paymentFailures) {
    }

    public record RevenueBlock(ParkingDtos.MoneyDto capturedGross,
                               ParkingDtos.MoneyDto capturedNet,
                               ParkingDtos.MoneyDto settledGross,
                               /** Charged and unconfirmed by any provider statement. */
                               ParkingDtos.MoneyDto unsettledGross,
                               long capturedCount) {
    }

    public record TransactionGroupDto(WalletTransactionType type, String labelKey, long count,
                                      /** Signed: a charge is negative. */
                                      ParkingDtos.MoneyDto total) {
    }

    public record ParkingGroupDto(PaymentStatus paymentStatus, String labelKey, long count,
                                  ParkingDtos.MoneyDto total) {
    }

    /** @param unzonedActive stays running outside every zone. Reported rather than folded away. */
    public record OccupancyBlock(long activeSessions, long unzonedActive, List<ZoneOccupancyDto> zones) {
    }

    /**
     * @param baysInService the denominator: only bays actually in service, because one closed for
     *                      roadworks is not capacity
     * @param percent       null when the zone has no numbered bays. Absent, which is not 0%
     */
    public record ZoneOccupancyDto(UUID zoneId, String code, String name, long activeSessions,
                                   long baysInService, Integer percent) {
    }

    public record VerdictGroupDto(PlateVerdict verdict, String labelKey, long count) {
    }

    public record CitationGroupDto(CitationStatus status, String labelKey, long count,
                                   ParkingDtos.MoneyDto total) {
    }

    public record ExemptionGroupDto(ExemptionStatus status, String labelKey, long count) {
    }

    /**
     * @param name         the officer's name as it stands today, resolved on read (v0.33). Somebody
     *                     who has left still appears: their work that week happened
     * @param lastCheckAt  null for an officer who wrote citations and looked nothing up in the window
     */
    public record InspectorActivityDto(UUID inspectorUserId, String name, long checks, long citations,
                                       Instant lastCheckAt) {
    }

    public record PaymentFailuresBlock(long count, ParkingDtos.MoneyDto amount,
                                       List<FailureGroupDto> byReason) {
    }

    /** @param code the provider's own code, verbatim. Translating it loses what a claim is made with. */
    public record FailureGroupDto(String code, String reason, long count, ParkingDtos.MoneyDto amount) {
    }
}
