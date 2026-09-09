package cr.luparx.enforcement.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ForbiddenException;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.core.page.PageRequest;
import cr.luparx.core.page.PageResponse;
import cr.luparx.enforcement.entity.AppealNotice;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationAppeal;
import cr.luparx.enforcement.entity.EnforcementSettings;
import cr.luparx.enforcement.entity.InfractionType;
import cr.luparx.enforcement.model.AppealStatus;
import cr.luparx.enforcement.model.CitationAction;
import cr.luparx.enforcement.model.CitationStatus;
import cr.luparx.enforcement.model.EnforcementActor;
import cr.luparx.enforcement.repository.CitationAppealRepository;
import cr.luparx.enforcement.repository.EnforcementSettingsRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

/**
 * The citizen's defence: filing one, and the municipality deciding it.
 *
 * <h2>Who may file, and when</h2>
 *
 * <ol>
 *   <li>Only the owner of the vehicle the citation is linked to. The same rule as the fines listing,
 *       for the same reason: plates are unique per citizen and not globally, so "whoever claims this
 *       plate" would let anybody file — and read — somebody else's case.</li>
 *   <li>Only when the infraction type admits a defence, which is the municipality's configuration.</li>
 *   <li>Only while the citation is payable and before its due date. After the window closes the
 *       channel is the municipality's counter, not this endpoint, and saying so with a distinct code
 *       is what lets the app explain it.</li>
 *   <li>Once. A second attempt on a citation already under appeal is a conflict, not a second case:
 *       two open defences on one act would have two possible outcomes.</li>
 * </ol>
 *
 * <h2>The notice is part of the act</h2>
 *
 * <p>Filing requires the identifier of the legal-notice version the citizen was shown, and it must be
 * the one currently in force. A stale identifier is refused with {@code APPEAL_NOTICE_OUTDATED} so the
 * client re-displays the current wording instead of recording an acceptance of text nobody read.</p>
 *
 * <h2>Resolving moves the citation</h2>
 *
 * <p>Accepting the defence dismisses the citation; rejecting it upholds it, and it becomes payable
 * again. Both go through {@link CitationService#transition} so the transition table and the
 * citation's own history are the single account of what happened.</p>
 */
@Service
public class AppealService {

    private final CitationAppealRepository appealRepository;
    private final EnforcementSettingsRepository settingsRepository;
    private final CitationService citationService;
    private final InfractionTypeService infractionTypeService;
    private final AppealNoticeService noticeService;
    private final Clock clock;

    public AppealService(CitationAppealRepository appealRepository,
                         EnforcementSettingsRepository settingsRepository,
                         CitationService citationService,
                         InfractionTypeService infractionTypeService,
                         AppealNoticeService noticeService,
                         Clock clock) {
        this.appealRepository = appealRepository;
        this.settingsRepository = settingsRepository;
        this.citationService = citationService;
        this.infractionTypeService = infractionTypeService;
        this.noticeService = noticeService;
        this.clock = clock;
    }

    // --- filing ------------------------------------------------------------------------------------

    /**
     * Files a defence and moves the citation to {@link CitationStatus#APPEALED}.
     *
     * <p>The photographs arrive afterwards, on the appeal's own endpoint: the text is what makes the
     * defence exist, and a citizen on a bad connection must not lose what they wrote because an image
     * failed to upload.</p>
     */
    @Transactional
    public CitationAppeal file(TenantId tenantId, EnforcementActor actor, Collection<UUID> ownVehicleIds,
                               UUID citationId, String body, UUID acceptedNoticeId, String locale) {
        Citation citation = citationService.requireForVehicles(tenantId, ownVehicleIds, citationId);
        InfractionType type = infractionTypeService.require(tenantId, citation.getInfractionTypeId());
        if (!type.isAllowsAppeal()) {
            throw ConflictException.of(ErrorCode.CITATION_APPEAL_NOT_ALLOWED,
                    "error.enforcement.citation.appealNotAllowed");
        }
        Instant now = clock.instant();
        // Checked before the window, and not after: once a defence exists the citation is APPEALED,
        // which is not payable, so the window check would answer "closed" to somebody whose real
        // situation is "you already filed one". Two different sentences on the citizen's screen.
        if (appealRepository.findByTenantIdAndCitationId(tenantId.value(), citation.getId()).isPresent()) {
            throw ConflictException.of(ErrorCode.APPEAL_ALREADY_FILED, "error.enforcement.appeal.alreadyFiled");
        }
        if (!citation.getStatus().isPayable() || (citation.getDueAt() != null && now.isAfter(citation.getDueAt()))) {
            // Either it is already settled, or the window closed. Its own code, so the app can say
            // which of the two happened instead of a bare "no".
            throw ConflictException.of(ErrorCode.APPEAL_WINDOW_CLOSED, "error.enforcement.appeal.windowClosed");
        }
        String text = body == null ? "" : body.trim();
        if (text.isEmpty() || text.length() > 4000) {
            throw new ValidationException("body", ErrorCode.VALIDATION_FAILED, "error.enforcement.appeal.body");
        }

        AppealNotice notice = noticeService.require(tenantId, locale);
        if (acceptedNoticeId == null || !acceptedNoticeId.equals(notice.getId())) {
            // The citizen accepted a wording that is no longer the one in force — or none at all.
            // Recording that as consent would make the notice worthless the day it matters.
            throw ConflictException.of(ErrorCode.APPEAL_NOTICE_OUTDATED, "error.enforcement.appeal.noticeOutdated");
        }

        CitationAppeal appeal = new CitationAppeal(Uuid7.generate(), tenantId.value(), citation.getId(),
                actor.userIdValue(), text, notice, now);
        try {
            appeal = appealRepository.saveAndFlush(appeal);
        } catch (DataIntegrityViolationException duplicate) {
            // The unique index on citation_id settled a race between two taps on the same button.
            throw ConflictException.of(ErrorCode.APPEAL_ALREADY_FILED, "error.enforcement.appeal.alreadyFiled");
        }
        citationService.transition(tenantId, actor, citation.getId(), CitationStatus.APPEALED,
                CitationAction.APPEALED, text.length() > 200 ? text.substring(0, 200) : text, false);
        return appeal;
    }

    // --- reading -----------------------------------------------------------------------------------

    /** The defence filed against one citation, if any. */
    @Transactional(readOnly = true)
    public Optional<CitationAppeal> findForCitation(TenantId tenantId, UUID citationId) {
        return appealRepository.findByTenantIdAndCitationId(tenantId.value(), citationId);
    }

    /** The citizen's own defence, reachable only through a citation that is already theirs. */
    @Transactional(readOnly = true)
    public CitationAppeal requireOwn(TenantId tenantId, Collection<UUID> ownVehicleIds, UUID citationId) {
        Citation citation = citationService.requireForVehicles(tenantId, ownVehicleIds, citationId);
        return appealRepository.findByTenantIdAndCitationId(tenantId.value(), citation.getId())
                .orElseThrow(() -> NotFoundException.of(ErrorCode.APPEAL_NOT_FOUND,
                        "error.enforcement.appeal.notFound"));
    }

    @Transactional(readOnly = true)
    public CitationAppeal require(TenantId tenantId, UUID appealId) {
        return appealRepository.findByTenantIdAndId(tenantId.value(), appealId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.APPEAL_NOT_FOUND,
                        "error.enforcement.appeal.notFound"));
    }

    /** The municipality's moderation queue: what is waiting, oldest first, or the whole history. */
    @Transactional(readOnly = true)
    public PageResponse<CitationAppeal> list(TenantId tenantId, AppealStatus status, PageRequest request) {
        org.springframework.data.domain.Pageable pageable =
                org.springframework.data.domain.PageRequest.of(request.page(), request.size());
        Page<CitationAppeal> page = status == null
                ? appealRepository.findByTenantIdOrderBySubmittedAtDesc(tenantId.value(), pageable)
                : appealRepository.findByTenantIdAndStatusOrderBySubmittedAtAsc(tenantId.value(), status, pageable);
        return PageResponse.of(page.getContent(), request.page(), request.size(), page.getTotalElements());
    }

    // --- deciding ----------------------------------------------------------------------------------

    /**
     * The municipality's decision, with its reason.
     *
     * <p>The reason is mandatory in both directions. A citizen whose defence is rejected is entitled
     * to read why, and a municipality that annuls its own citation owes its auditor the same
     * sentence.</p>
     */
    @Transactional
    public CitationAppeal resolve(TenantId tenantId, EnforcementActor actor, UUID citationId, boolean accept,
                                  String reason) {
        CitationAppeal appeal = appealRepository.findByTenantIdAndCitationId(tenantId.value(), citationId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.APPEAL_NOT_FOUND,
                        "error.enforcement.appeal.notFound"));
        if (appeal.getStatus().isResolved()) {
            throw ConflictException.of(ErrorCode.APPEAL_ALREADY_RESOLVED,
                    "error.enforcement.appeal.alreadyResolved");
        }
        String text = reason == null ? "" : reason.trim();
        if (text.isEmpty() || text.length() > 1000) {
            throw new ValidationException("reason", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.citation.reasonRequired");
        }
        Instant now = clock.instant();
        appeal.resolve(accept ? AppealStatus.ACCEPTED : AppealStatus.REJECTED, actor.userIdValue(), text, now);
        appealRepository.save(appeal);

        citationService.transition(tenantId, actor, citationId,
                accept ? CitationStatus.DISMISSED : CitationStatus.UPHELD,
                accept ? CitationAction.APPEAL_DISMISSED : CitationAction.APPEAL_UPHELD, text, true);
        return appeal;
    }

    // --- settings ----------------------------------------------------------------------------------

    /** How many photographs a defence may carry here. The municipality's decision, with a default. */
    @Transactional(readOnly = true)
    public int appealMaxImages(TenantId tenantId) {
        return settingsRepository.findById(tenantId.value())
                .map(EnforcementSettings::getAppealMaxImages)
                .orElse(EnforcementSettings.DEFAULT_APPEAL_MAX_IMAGES);
    }

    @Transactional
    public EnforcementSettings updateSettings(TenantId tenantId, int appealMaxImages) {
        if (appealMaxImages < 0 || appealMaxImages > 20) {
            throw new ValidationException("appealMaxImages", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.settings.appealMaxImages");
        }
        Instant now = clock.instant();
        EnforcementSettings settings = settingsRepository.findById(tenantId.value())
                .orElseGet(() -> new EnforcementSettings(tenantId.value(),
                        EnforcementSettings.DEFAULT_APPEAL_MAX_IMAGES, now));
        settings.update(appealMaxImages, now);
        return settingsRepository.save(settings);
    }

    /** Guard used before accepting an image: the defence must be the caller's and still open. */
    @Transactional(readOnly = true)
    public CitationAppeal requireOpenOwn(TenantId tenantId, UserId userId, Collection<UUID> ownVehicleIds,
                                         UUID citationId) {
        CitationAppeal appeal = requireOwn(tenantId, ownVehicleIds, citationId);
        if (!appeal.getUserId().equals(userId.value())) {
            // Same answer as "does not exist": confirming it would tell one citizen that another
            // filed a defence on a citation they can see.
            throw NotFoundException.of(ErrorCode.APPEAL_NOT_FOUND, "error.enforcement.appeal.notFound");
        }
        if (appeal.getStatus().isResolved()) {
            throw ConflictException.of(ErrorCode.APPEAL_ALREADY_RESOLVED,
                    "error.enforcement.appeal.alreadyResolved");
        }
        return appeal;
    }

    /** Only the person who filed it may read it back through the citizen portal. */
    @Transactional(readOnly = true)
    public void requireAuthor(CitationAppeal appeal, UserId userId) {
        if (!appeal.getUserId().equals(userId.value())) {
            throw ForbiddenException.of(ErrorCode.ACCESS_DENIED, "error.access.denied");
        }
    }
}
