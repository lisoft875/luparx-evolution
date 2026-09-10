package cr.luparx.app.web.dto;

import cr.luparx.billing.model.LineMatchStatus;
import cr.luparx.billing.model.PaymentMethod;
import cr.luparx.billing.model.PaymentPurpose;
import cr.luparx.billing.model.PaymentState;
import cr.luparx.billing.model.ReconciliationStatus;
import cr.luparx.billing.model.SettlementStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Wire shapes of {@code /api/v1/admin/billing/**} (CONTRACT.md v0.35).
 *
 * <p>Every amount is a {@link ParkingDtos.MoneyDto} — minor units with their currency beside them,
 * never a bare number (ADR 0009). On this screen more than any other: a figure whose currency the
 * client has to infer is a figure that will be rendered wrong the first time a municipality outside
 * Costa Rica uses it, and it will be rendered wrong in a column labelled "what we are owed".</p>
 */
public final class BillingDtos {

    private BillingDtos() {
    }

    /**
     * One attempt to receive money.
     *
     * @param gross what the citizen paid — the number on their own statement, the one they can quote
     * @param fee   what the provider kept. Null until it says, which for a card is usually the
     *              statement rather than the moment of payment
     * @param net   what reached the municipality
     */
    public record PaymentResponse(UUID id,
                                  PaymentMethod method,
                                  String methodLabelKey,
                                  String provider,
                                  String providerReference,
                                  PaymentState status,
                                  String statusLabelKey,
                                  PaymentPurpose purpose,
                                  ParkingDtos.MoneyDto gross,
                                  ParkingDtos.MoneyDto fee,
                                  ParkingDtos.MoneyDto net,
                                  ReconciliationStatus reconciliationStatus,
                                  String reconciliationLabelKey,
                                  Instant requestedAt,
                                  Instant confirmedAt,
                                  Instant settledAt,
                                  String failureCode,
                                  String failureReason,
                                  UUID userId,
                                  String targetType,
                                  UUID targetId) {
    }

    /**
     * What a period adds up to.
     *
     * @param unsettledGross of what was charged, what no statement has confirmed yet. The figure a
     *                       treasurer opens this screen for
     */
    public record BillingTotalsResponse(ParkingDtos.MoneyDto capturedGross,
                                        ParkingDtos.MoneyDto capturedNet,
                                        ParkingDtos.MoneyDto settledGross,
                                        ParkingDtos.MoneyDto unsettledGross,
                                        long capturedCount,
                                        long failedCount,
                                        Instant from,
                                        Instant to) {
    }

    public record SettlementResponse(UUID id,
                                     String provider,
                                     String externalReference,
                                     Instant periodStart,
                                     Instant periodEnd,
                                     /** As the provider declared them. Never recomputed from the lines. */
                                     ParkingDtos.MoneyDto declaredGross,
                                     ParkingDtos.MoneyDto declaredFee,
                                     ParkingDtos.MoneyDto declaredNet,
                                     LocalDate depositExpectedOn,
                                     String depositReference,
                                     SettlementStatus status,
                                     String statusLabelKey,
                                     Instant importedAt,
                                     Instant reconciledAt) {
    }

    /** One line of a statement, with what became of it here. */
    public record SettlementLineResponse(UUID id,
                                         String providerReference,
                                         ParkingDtos.MoneyDto gross,
                                         ParkingDtos.MoneyDto fee,
                                         ParkingDtos.MoneyDto net,
                                         Instant occurredAt,
                                         UUID paymentId,
                                         LineMatchStatus matchStatus,
                                         String matchLabelKey) {
    }

    /**
     * What the reconciliation found.
     *
     * @param missingPayments        payments captured inside the period that this statement never
     *                               mentioned — money charged and not received
     * @param declaredTotalsDisagree the provider's own header does not equal the sum of its own
     *                               lines. A finding about the provider, which is why the header was
     *                               stored rather than recomputed
     */
    public record ReconciliationResponse(SettlementResponse settlement,
                                         int lineCount,
                                         int matched,
                                         int unknownPayments,
                                         int amountMismatches,
                                         int duplicates,
                                         int missingPayments,
                                         ParkingDtos.MoneyDto lineGross,
                                         ParkingDtos.MoneyDto lineFee,
                                         ParkingDtos.MoneyDto lineNet,
                                         boolean declaredTotalsDisagree,
                                         boolean hasFindings,
                                         List<SettlementLineResponse> findings) {
    }

    /**
     * A provider's statement, as it arrived.
     *
     * <p>The header totals are taken as given and are not checked against the lines before storing:
     * the disagreement is a finding, and refusing the import would leave the municipality with no
     * statement at all and no way to show the provider what they sent.</p>
     */
    public record ImportSettlementRequest(@NotBlank @Size(max = 64) String provider,
                                          @NotBlank @Size(max = 120) String externalReference,
                                          @NotNull Instant periodStart,
                                          @NotNull Instant periodEnd,
                                          @Min(0) long declaredGrossMinor,
                                          @Min(0) long declaredFeeMinor,
                                          @Min(0) long declaredNetMinor,
                                          @NotBlank @Size(min = 3, max = 3) String currencyCode,
                                          LocalDate depositExpectedOn,
                                          @Size(max = 120) String depositReference,
                                          @NotEmpty @Valid List<SettlementLineRequest> lines) {
    }

    public record SettlementLineRequest(@NotBlank @Size(max = 120) String providerReference,
                                        @Min(0) long grossAmountMinor,
                                        @Min(0) long feeAmountMinor,
                                        @Min(0) long netAmountMinor,
                                        Instant occurredAt) {
    }

    /**
     * A payment recorded by hand or by an integration, without a gateway of our own.
     *
     * <p>Exists so that a municipality collecting through a provider LupaRX does not talk to can
     * still have every peso in the one table where income is proved. The alternative is a treasurer
     * reconciling a screen that can only see part of the money, which is worse than no screen.</p>
     */
    public record RecordPaymentRequest(@NotNull PaymentMethod method,
                                       @Size(max = 64) String provider,
                                       @Size(max = 120) String providerReference,
                                       @Min(1) long grossAmountMinor,
                                       Long feeAmountMinor,
                                       @NotNull PaymentPurpose purpose,
                                       UUID userId,
                                       @Size(max = 24) String targetType,
                                       UUID targetId,
                                       Instant confirmedAt) {
    }
}
