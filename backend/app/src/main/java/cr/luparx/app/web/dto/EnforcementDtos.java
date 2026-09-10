package cr.luparx.app.web.dto;

import cr.luparx.core.domain.Portal;
import cr.luparx.enforcement.model.BeneficiaryKind;
import cr.luparx.enforcement.model.CitationAction;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.AppealStatus;
import cr.luparx.enforcement.model.EvidenceKind;
import cr.luparx.enforcement.model.EvidenceSource;
import cr.luparx.enforcement.model.ExemptionStatus;
import cr.luparx.enforcement.model.LocationState;
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
                                      /** The stay that ran out on this bay, when the verdict is EXPIRED. */
                                      ActiveStayResponse expiredStay,
                                      /** Why this plate is not fined, when the verdict is EXEMPT. */
                                      PlateExemptionSummary exemption,
                                      List<ActiveStayResponse> otherStays,
                                      /**
                                       * The municipality's tolerance in minutes. Carried so a COVERED
                                       * whose expiry has already passed can explain itself instead of
                                       * reading as a contradiction (CONTRACT.md v0.28).
                                       */
                                      int graceMinutes,
                                      /**
                                       * The fiscalisation-log entry this lookup produced (v0.29).
                                       * The device sends it back on the citation, which is what links
                                       * "he looked" to "he then fined".
                                       */
                                      UUID checkId,
                                      Instant checkedAt) {
    }

    /**
     * The exemption as the officer sees it: enough to say out loud why this car is not being fined.
     *
     * <p>The reason travels because an officer who declines to write a citation has to be able to
     * explain it on the spot and, months later, to whoever asks why. Who granted it does not travel:
     * that is the municipality's internal record, not something to hand to whoever is standing by the
     * car.</p>
     */
    public record PlateExemptionSummary(UUID id, String plate, String reason, String documentRef,
                                        /**
                                         * The category, as this municipality named it (v0.30):
                                         * "Discapacidad", "Vehículo institucional". The officer says
                                         * this out loud; the <b>beneficiary</b> deliberately does not
                                         * travel here, because knowing whose permit it is adds nothing
                                         * to the decision not to fine and everything to what a device
                                         * in the street is carrying about a person.
                                         */
                                        String typeName,
                                        Instant validFrom, Instant validTo) {
    }

    public record BayResponse(UUID spaceId, String spaceCode, UUID zoneId, String zoneCode, String zoneName) {
    }

    /**
     * {@code POST /inspector/plate-checks} — the plate lookup, since v0.29.
     *
     * <p>A POST for two reasons, both of them substantive. It is <b>no longer safe</b>: every lookup
     * writes a row in the fiscalisation log, and a GET that records what somebody did is a GET that
     * lies about itself to every cache and every retry in the chain. And it now carries the officer's
     * <b>coordinates</b>, which are personal data and do not belong in a URL — query strings end up in
     * browser history, proxy logs and access logs (SECURITY.md §11).</p>
     *
     * <p>{@code locationState} is what the device actually knows. It is not derived from whether the
     * coordinates are present: "not granted", "granted but no fix" and "granted with a fix" are three
     * different facts, and until v0.29 all three arrived as an absent latitude.</p>
     */
    public record PlateCheckRequest(
            @NotBlank @Size(max = 32) String plate,
            UUID zoneId,
            @Size(max = 32) String spaceCode,
            LocationState locationState,
            @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal latitude,
            @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal longitude,
            @DecimalMin("0.0") BigDecimal locationAccuracyM) {
    }

    /**
     * One recorded lookup, as the municipality's activity screen reads it.
     *
     * @param citationIssued whether a citation came out of this lookup. It is what turns "he looked"
     *                       into "he looked and then fined", and it answers the other direction too —
     *                       "they fined me without coming to look" — which had no answer before v0.29
     */
    public record EnforcementCheckResponse(UUID id,
                                           UUID inspectorUserId,
                                           String inspectorName,
                                           String plate,
                                           String plateRaw,
                                           UUID zoneId,
                                           String zoneName,
                                           String spaceCode,
                                           PlateVerdict verdict,
                                           String refusalCode,
                                           LocationState locationState,
                                           BigDecimal latitude,
                                           BigDecimal longitude,
                                           BigDecimal locationAccuracyM,
                                           String userAgent,
                                           boolean citationIssued,
                                           Instant occurredAt) {
    }

    /**
     * A stay as enforcement sees it: where, until when, and what was paid. Never <b>who</b> paid.
     *
     * <p>Since v0.32 it carries the payment, which is the point of the whole flow: the officer reads
     * whether the stay was paid from the same record that produced the payment, rather than inferring
     * it from the fact that a stay exists. A stay can exist and have cost nothing — courtesy, the
     * citizen's own saved minutes, an hour this municipality does not charge for — and an officer who
     * cannot tell those from a payment has nothing to say to the person arguing with them.</p>
     *
     * <p>The amount and the movement travel; the <b>citizen</b> does not. What is in the officer's
     * hand is a receipt for a bay, not an account statement: it answers a complaint at the bay, and
     * it names nobody.</p>
     *
     * @param paymentStatus  {@code PAID}, {@code NO_CHARGE}, {@code PENDING} or {@code FAILED}
     * @param noChargeReason {@code COURTESY}, {@code CREDIT} or {@code OUTSIDE_HOURS}; null unless
     *                       nothing was charged, and null too on stays written before V31_0 whose
     *                       reason could not be reconstructed
     */
    public record ActiveStayResponse(UUID sessionId, UUID zoneId, String zoneCode, String zoneName, UUID spaceId,
                                     String spaceCode, Instant startedAt, Instant expiresAt,
                                     String paymentStatus, String noChargeReason,
                                     ParkingDtos.MoneyDto amount, UUID paymentTransactionId) {
    }

    // --- plate exemptions (CONTRACT.md v0.28) ------------------------------------------------------

    /**
     * {@code POST /admin/enforcement/exemptions}.
     *
     * <p>{@code reason} is required and is free text rather than a category: what one country exempts
     * is not what another does, so an enum here would be one nation's law baked into the contract.
     * What is invariant is that somebody has to write down why.</p>
     *
     * <p>{@code validTo} may be omitted, and that means <b>no expiry</b> — legitimate for a council's
     * own fleet. The screen says so in those words rather than leaving a blank cell, because an
     * exemption nobody reviews is how a sold vehicle keeps parking free.</p>
     */
    public record RequestExemptionRequest(
            /**
             * The category, from this municipality's own catalogue. Optional only for the deprecated
             * shape below; a request that names no category falls into the generic one.
             */
            UUID exemptionTypeId,
            /**
             * One or several. A disability permit belongs to the person and travels with them.
             *
             * <p>No bean-validation annotation on the elements: each one goes through the same
             * normaliser the officer's lookup uses, which is a stricter check than a length and the
             * only one that matters — a permit the lookup cannot find is a permit that does not
             * exist.</p>
             */
            List<String> plates,
            // DEPRECATED since v0.30 — send `plates`. A body carrying this and no `plates` is the
            // v0.28 shape, and it is answered with the v0.28 BEHAVIOUR: the permit is registered and
            // granted in one act by the same person, recorded as such. Quietly changing what an old
            // client's call does would leave a vehicle being fined that its operator believes is
            // exempt, which is worse than a legacy branch that disappears in the contraction.
            @Size(max = 32) String plate,
            BeneficiaryKind beneficiaryKind,
            @Size(max = 200) String beneficiaryName,
            /** Personal identifier. Never leaves the administration screens — see the officer's DTO. */
            @Size(max = 64) String beneficiaryDocument,
            @NotBlank @Size(max = 300) String reason,
            @Size(max = 120) String documentRef,
            Instant validFrom,
            Instant validTo) {
    }

    /** {@code PUT /admin/enforcement/exemptions/{id}}. Plates are added and removed on their own. */
    public record AmendExemptionRequest(
            /** Optional: omitted keeps the category the permit already has. */
            UUID exemptionTypeId,
            BeneficiaryKind beneficiaryKind,
            @Size(max = 200) String beneficiaryName,
            @Size(max = 64) String beneficiaryDocument,
            @NotBlank @Size(max = 300) String reason,
            @Size(max = 120) String documentRef,
            Instant validFrom,
            Instant validTo) {
    }

    /** {@code POST …/{id}/revoke}. The reason is required: an empty cell is not an answer. */
    public record RevokeExemptionRequest(@NotBlank @Size(max = 300) String reason) {
    }

    /**
     * {@code POST …/{id}/reject}. A refusal owes the person who asked an explanation, so the reason is
     * required here exactly as it is on a revocation.
     */
    public record RejectExemptionRequest(@NotBlank @Size(max = 300) String reason) {
    }

    /** {@code POST …/{id}/plates}. */
    public record AddExemptionPlateRequest(@NotBlank @Size(max = 32) String plate) {
    }

    /** {@code POST/PUT /admin/enforcement/exemption-types}. The code is set once and never edited. */
    public record SaveExemptionTypeRequest(
            @Size(max = 32) String code,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 400) String description,
            boolean requiresBeneficiary,
            /** Only on update; omitted keeps it as it is. Retiring is not deleting. */
            Boolean active) {
    }

    /** One category of this municipality's catalogue. */
    public record ExemptionTypeResponse(UUID id, String code, String name, String description,
                                        boolean requiresBeneficiary, boolean active) {
    }

    /** One plate a permit covers. {@code plateRaw} is what was typed; it is what an appeal argues over. */
    public record ExemptionPlateResponse(String plate, String plateRaw, ExemptionStatus status, Instant addedAt) {
    }

    /**
     * A document backing a permit. The bytes are fetched separately; this is its trace.
     *
     * @param sha256 the digest of what was stored — what distinguishes "this is the assessment that
     *               was submitted" from "this is a file somebody put there afterwards"
     */
    public record ExemptionDocumentResponse(UUID id, String title, String contentType, long byteSize,
                                            String sha256, String uploadedByName, Instant createdAt) {
    }

    /**
     * One exemption as the municipality's register shows it.
     *
     * @param inForce  whether it exempts <em>right now</em> — computed against the clock, never stored
     * @param pending  registered, but its window has not opened yet
     * @param expired  registered, and its window has closed. There is no {@code EXPIRED} status:
     *                 running out is a fact about the clock, not a decision anybody took
     */
    public record PlateExemptionResponse(UUID id,
                                         // DEPRECATED since v0.30 — read `plates`. This is the first
                                         // of them, kept so a client older than this version still
                                         // shows something true.
                                         String plate,
                                         String plateRaw,
                                         String reason,
                                         String documentRef,
                                         ExemptionStatus status,
                                         Instant validFrom,
                                         Instant validTo,
                                         boolean inForce,
                                         boolean pending,
                                         boolean expired,
                                         Instant grantedAt,
                                         Instant revokedAt,
                                         String revokeReason,
                                         // --- v0.30 -------------------------------------------------
                                         UUID exemptionTypeId,
                                         String exemptionTypeCode,
                                         String exemptionTypeName,
                                         List<ExemptionPlateResponse> plates,
                                         BeneficiaryKind beneficiaryKind,
                                         String beneficiaryName,
                                         String beneficiaryDocument,
                                         Instant requestedAt,
                                         String requestedByName,
                                         Instant decidedAt,
                                         /**
                                          * Who granted or refused it. The question an auditor asks is
                                          * "who authorised that this car did not pay", and it is not
                                          * answered by naming whoever typed the request.
                                          */
                                         String decidedByName,
                                         String decisionReason,
                                         /**
                                          * True when the same person asked and decided. Permitted — a
                                          * small municipality may have nobody else — and therefore
                                          * shown, so nobody has to compare two names to notice.
                                          */
                                         boolean selfApproved,
                                         int documentCount) {
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
            /**
             * The plate lookup this citation came out of (CONTRACT.md v0.29). Optional: a citation
             * can be written without one — the officer saw the car yesterday, the app had no signal —
             * and requiring it would turn a traceability field into something that stops the work.
             */
            UUID enforcementCheckId,
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
                                   /**
                                    * The officer's name as it was when the act was raised
                                    * (CONTRACT.md v0.15). Travels beside the id because the id
                                    * answers "who" only to somebody who can look it up, and a
                                    * citation is read by people who cannot — and because it must
                                    * keep reading the same years later, whatever happens to the
                                    * officer's post or their surname.
                                    */
                                   String inspectorName,
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
