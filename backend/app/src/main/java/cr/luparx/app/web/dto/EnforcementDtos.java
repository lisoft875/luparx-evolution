package cr.luparx.app.web.dto;

import cr.luparx.core.domain.Portal;
import cr.luparx.enforcement.model.CitationAction;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.AppealStatus;
import cr.luparx.enforcement.model.EvidenceKind;
import cr.luparx.enforcement.model.EvidenceSource;
import cr.luparx.enforcement.model.PlateVerdict;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Wire shapes of enforcement (CONTRACT.md "v0.7 — Fiscalización").
 *
 * <p>Explicit records, never serialised entities: the mapping is where data minimisation happens and
 * where the contract stops being an accident of the schema. It matters more here than anywhere else
 * in the platform — a citation is read by an officer, by an administrator and by the citizen who was
 * fined, and those three are not entitled to the same fields.</p>
 *
 * <p>Money travels as {@link ParkingDtos.MoneyDto}: integer minor units with the ISO 4217 code, never
 * a decimal (ADR 0009). Statuses and actions travel as keys with a {@code labelKey}; the server never
 * sends a translated word, because the officer and the citizen may read different languages.</p>
 */
public final class EnforcementDtos {

    private EnforcementDtos() {
    }

    // --- infraction catalogue ---------------------------------------------------------------------

    /** One kind of infraction, as the officer's app and the administrator's screen both read it. */
    public record InfractionTypeResponse(UUID id,
                                         String code,
                                         String name,
                                         String description,
                                         ParkingDtos.MoneyDto fine,
                                         ParkingDtos.MoneyDto discountedFine,
                                         Integer discountDays,
                                         Integer discountPercent,
                                         int dueDays,
                                         boolean requiresPhoto,
                                         boolean allowsAppeal,
                                         boolean active) {
    }

    /**
     * {@code PUT /admin/enforcement/infraction-types}. The whole catalogue in one call: entries with
     * an {@code id} are updated, entries without one are created, and entries that are absent are
     * <b>deactivated</b> — never deleted, because issued citations reference them.
     */
    public record UpdateInfractionTypesRequest(
            @NotEmpty @Size(max = 200) @Valid List<InfractionTypeRequest> infractionTypes) {
    }

    public record InfractionTypeRequest(
            UUID id,
            @NotBlank @Size(max = 32) String code,
            @NotBlank @Size(max = 160) String name,
            @Size(max = 1000) String description,
            @NotNull @Min(0) Long fineAmountMinor,
            Boolean requiresPhoto,
            Boolean allowsAppeal,
            @Min(1) Integer discountDays,
            @Min(1) Integer discountPercent,
            @NotNull @Min(1) Integer dueDays,
            Boolean active) {
    }

    // --- plate lookup ------------------------------------------------------------------------------

    /**
     * {@code GET /inspector/plates/{plate}/status}. The answer to "has this plate paid, here, now?".
     *
     * <p>{@code verdict} is never {@code COVERED} unless a bay was supplied and a running session was
     * found <em>on that bay</em>; see {@code PlateVerdict}. {@code otherStays} carries the running
     * sessions for the same plate elsewhere in the municipality, which is what lets the officer tell
     * "paid for another bay" from "did not pay" — and it says nothing about who owns them.</p>
     */
    public record PlateStatusResponse(String plate,
                                      String plateNormalized,
                                      PlateVerdict verdict,
                                      String verdictLabelKey,
                                      boolean requiresBay,
                                      BayResponse bay,
                                      ActiveStayResponse coveringStay,
                                      List<ActiveStayResponse> otherStays,
                                      Instant checkedAt) {
    }

    public record BayResponse(UUID spaceId, String spaceCode, UUID zoneId, String zoneCode, String zoneName) {
    }

    /** A running stay as enforcement sees it: where and until when. Never who paid for it. */
    public record ActiveStayResponse(UUID sessionId, UUID zoneId, String zoneCode, String zoneName, UUID spaceId,
                                     String spaceCode, Instant startedAt, Instant expiresAt) {
    }

    // --- citations ---------------------------------------------------------------------------------

    /**
     * {@code POST /inspector/citations}. What the officer's device sends.
     *
     * <p>{@code deviceCitationId} is the identifier the device generated for this capture. Sending it
     * is what makes a resend after a lost connection resolve to the same citation, even when the retry
     * carries a new {@code Idempotency-Key} — the header protects the request, this protects the act.
     * {@code occurredAt} is the officer's declaration of when the infraction happened; the server
     * records its own emission time separately and never overwrites this one.</p>
     */
    public record CreateCitationRequest(
            @NotNull UUID infractionTypeId,
            @NotBlank @Size(max = 32) String plate,
            UUID zoneId,
            UUID spaceId,
            @Size(max = 32) String spaceCode,
            @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal latitude,
            @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal longitude,
            @DecimalMin("0.0") BigDecimal locationAccuracyM,
            @Size(max = 300) String addressText,
            Instant occurredAt,
            @Size(max = 64) String deviceCitationId,
            UUID parkingSessionId,
            @Size(max = 2000) String notes) {
    }

    /** A reason is mandatory wherever an act is annulled or an appeal resolved. */
    public record CitationReasonRequest(@NotBlank @Size(max = 500) String reason) {
    }

    /** {@code POST /inspector/citations/{id}/evidence} when the evidence is a written note. */
    public record CitationNoteRequest(@NotBlank @Size(max = 2000) String note) {
    }

    /** The citation as the officer and the administration read it. */
    public record CitationResponse(UUID id,
                                   String number,
                                   Integer seriesYear,
                                   CitationStatus status,
                                   String statusLabelKey,
                                   String statusReason,
                                   String plate,
                                   UUID vehicleId,
                                   UUID zoneId,
                                   String zoneCode,
                                   String zoneName,
                                   UUID spaceId,
                                   String spaceCode,
                                   BigDecimal latitude,
                                   BigDecimal longitude,
                                   BigDecimal locationAccuracyM,
                                   String addressText,
                                   UUID infractionTypeId,
                                   String infractionCode,
                                   String infractionName,
                                   ParkingDtos.MoneyDto fine,
                                   ParkingDtos.MoneyDto amountPayable,
                                   ParkingDtos.MoneyDto discountedFine,
                                   Instant discountUntil,
                                   Instant dueAt,
                                   Instant occurredAt,
                                   Instant issuedAt,
                                   Long deviceClockSkewSeconds,
                                   UUID inspectorUserId,
                                   UUID parkingSessionId,
                                   String notes,
                                   int evidenceCount) {
    }

    /** The citation with everything a defence is entitled to read: its evidence and its history. */
    public record CitationDetailResponse(CitationResponse citation,
                                         List<EvidenceResponse> evidence,
                                         List<CitationEventResponse> history) {
    }

    /**
     * A piece of evidence. The bytes are fetched separately through {@code contentUrl}; the digest
     * travels with the metadata because it is what proves, later, that the photograph is the one that
     * was taken.
     */
    public record EvidenceResponse(UUID id,
                                   EvidenceKind kind,
                                   EvidenceSource source,
                                   String contentType,
                                   Long byteSize,
                                   String sha256,
                                   String note,
                                   Instant capturedAt,
                                   BigDecimal latitude,
                                   BigDecimal longitude,
                                   Instant createdAt,
                                   String contentUrl) {
    }

    /** One entry of the citation's own history. */
    public record CitationEventResponse(UUID id,
                                        CitationAction action,
                                        String actionLabelKey,
                                        CitationStatus fromStatus,
                                        CitationStatus toStatus,
                                        UUID actorUserId,
                                        Portal actorPortal,
                                        String reason,
                                        Instant occurredAt) {
    }

    // --- citizen -------------------------------------------------------------------------------------

    /**
     * A fine as the citizen sees it. Deliberately narrower than the officer's view: no officer
     * identifier, no device clock skew, no internal session reference — the citizen is entitled to
     * what the act says and what it costs, and the rest is the municipality's internal trail.
     */
    public record FineResponse(UUID id,
                               String number,
                               CitationStatus status,
                               String statusLabelKey,
                               String plate,
                               String infractionCode,
                               String infractionName,
                               String zoneName,
                               String spaceCode,
                               String addressText,
                               ParkingDtos.MoneyDto fine,
                               ParkingDtos.MoneyDto amountPayable,
                               Instant discountUntil,
                               Instant dueAt,
                               Instant occurredAt,
                               Instant issuedAt,
                               boolean appealable,
                               int evidenceCount) {
    }

    /** The citizen's detail: the fine, its evidence and its history — the same history the office reads. */
    public record FineDetailResponse(FineResponse fine,
                                     List<EvidenceResponse> evidence,
                                     List<CitationEventResponse> history,
                                     AppealResponse appeal) {
    }

    // --- appeals ------------------------------------------------------------------------------------

    /**
     * The legal notice shown before writing a defence.
     *
     * <p>{@code id} is not decoration: it is what the client sends back when filing, and the server
     * refuses anything but the version currently in force. That is what turns "we warned them" from a
     * claim into a record.</p>
     */
    public record AppealNoticeResponse(UUID id, int version, String locale, String body, Instant effectiveFrom,
                                       boolean countryDefault) {
    }

    /** {@code POST /citizen/fines/{id}/appeals}. */
    public record FileAppealRequest(
            @NotBlank @Size(max = 4000) String body,
            @NotNull UUID acceptedNoticeId) {
    }

    /** A defence, as the citizen and the municipality both read it. */
    public record AppealResponse(UUID id,
                                 UUID citationId,
                                 AppealStatus status,
                                 String statusLabelKey,
                                 String body,
                                 Instant submittedAt,
                                 Instant resolvedAt,
                                 String resolutionReason,
                                 int noticeVersion,
                                 int maxImages,
                                 List<EvidenceResponse> images) {
    }

    /**
     * {@code POST /admin/enforcement/citations/{id}/appeal/resolve}. The reason is mandatory in both
     * directions: a citizen whose defence is rejected is entitled to read why, and a municipality
     * that voids its own citation owes its auditor the same sentence.
     */
    public record ResolveAppealRequest(
            @NotNull Boolean accept,
            @NotBlank @Size(max = 1000) String reason) {
    }

    /** {@code PUT /admin/enforcement/appeal-notice} — publishes a NEW version; nothing is edited. */
    public record PublishAppealNoticeRequest(
            @Size(max = 35) String locale,
            @NotBlank @Size(max = 8000) String body,
            Instant effectiveFrom) {
    }

    /** Per-municipality enforcement settings. */
    public record EnforcementSettingsResponse(int appealMaxImages) {
    }

    public record UpdateEnforcementSettingsRequest(@NotNull @Min(0) @Max(20) Integer appealMaxImages) {
    }

    // --- inspector catalogue --------------------------------------------------------------------------

    /**
     * A zone as the officer's device needs it: what to call it and which bay codes exist in it.
     *
     * <p>No tariff. An officer does not quote prices, and a screen that showed one would invite the
     * question of whether they can negotiate it.</p>
     */
    public record InspectorZoneResponse(UUID id, String code, String name, String description,
                                        ParkingDtos.SpaceCodeRange spaceCodes) {
    }
}
