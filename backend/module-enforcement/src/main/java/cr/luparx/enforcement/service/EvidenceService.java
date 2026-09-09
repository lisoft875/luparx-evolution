package cr.luparx.enforcement.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.enforcement.entity.Citation;
import cr.luparx.enforcement.entity.CitationAppeal;
import cr.luparx.enforcement.entity.CitationEvidence;
import cr.luparx.enforcement.model.EnforcementActor;
import cr.luparx.enforcement.model.EvidenceKind;
import cr.luparx.enforcement.model.EvidencePolicy;
import cr.luparx.enforcement.model.EvidenceSource;
import cr.luparx.enforcement.model.ImageSniffer;
import cr.luparx.enforcement.port.EvidenceStorage;
import cr.luparx.enforcement.repository.CitationEvidenceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Photographs and notes attached to a citation.
 *
 * <h2>What is validated, and why here</h2>
 *
 * <p>The size and the type are checked <b>before</b> the bytes reach any storage implementation, so a
 * filesystem store in development and an object store in production cannot end up enforcing different
 * rules. The type is decided by reading the file's own header ({@link ImageSniffer}), never by the
 * name or the {@code Content-Type} the device declared: both are chosen by the uploader, and
 * believing them is how something that is not an image at all gets stored and served back as one.</p>
 *
 * <h2>Integrity</h2>
 *
 * <p>The SHA-256 of the stored bytes is recorded on the row. Months later, when the citation is
 * challenged, that digest is what distinguishes "this is the photograph the officer took" from "this
 * is a photograph somebody put there afterwards" — and it costs one pass over a file we are already
 * holding in memory.</p>
 *
 * <h2>Which citations accept evidence</h2>
 *
 * <p>A draft accepts it — that is the whole point of the draft state, the photograph arriving over a
 * connection that did not exist when the officer pressed the button. An issued citation accepts it
 * too, because further evidence <em>adds</em> to the act and never alters it. A citation that is
 * closed (paid, annulled, dismissed) does not: attaching evidence to a settled act would be editing
 * history, and the honest answer is to refuse.</p>
 */
@Service
public class EvidenceService {

    private final CitationEvidenceRepository evidenceRepository;
    private final CitationService citationService;
    private final EvidenceStorage storage;
    private final EvidencePolicy policy;
    private final Clock clock;

    public EvidenceService(CitationEvidenceRepository evidenceRepository, CitationService citationService,
                           EvidenceStorage storage, EvidencePolicy policy, Clock clock) {
        this.evidenceRepository = evidenceRepository;
        this.citationService = citationService;
        this.storage = storage;
        this.policy = policy;
        this.clock = clock;
    }

    public EvidencePolicy policy() {
        return policy;
    }

    @Transactional
    public CitationEvidence attachPhoto(TenantId tenantId, EnforcementActor actor, UUID citationId, byte[] content,
                                        String originalFilename, Instant capturedAt, BigDecimal latitude,
                                        BigDecimal longitude) {
        Citation citation = citationService.require(tenantId, citationId);
        requireOpen(citation);

        if (content == null || content.length == 0) {
            throw new ValidationException("file", ErrorCode.VALIDATION_FAILED, "error.enforcement.evidence.empty");
        }
        if (content.length > policy.maxBytes()) {
            throw new ValidationException("file", ErrorCode.EVIDENCE_TOO_LARGE, "error.enforcement.evidence.tooLarge");
        }
        String contentType = ImageSniffer.sniff(content)
                .filter(policy::allows)
                .orElseThrow(() -> new ValidationException("file", ErrorCode.EVIDENCE_TYPE_NOT_ALLOWED,
                        "error.enforcement.evidence.typeNotAllowed"));
        long photos = evidenceRepository.countByTenantIdAndCitationIdAndKindAndSource(tenantId.value(), citationId,
                EvidenceKind.PHOTO, EvidenceSource.OFFICER);
        if (photos >= policy.maxPhotosPerCitation()) {
            throw ConflictException.of(ErrorCode.EVIDENCE_LIMIT_REACHED, "error.enforcement.evidence.limitReached");
        }

        Instant now = clock.instant();
        Instant captured = capturedAt == null ? now : capturedAt;
        EvidenceStorage.Stored stored = storage.store(tenantId, citationId,
                new EvidenceStorage.Upload(content, contentType, originalFilename, captured,
                        latitude == null ? null : latitude.doubleValue(),
                        longitude == null ? null : longitude.doubleValue()));

        CitationEvidence evidence = CitationEvidence.photo(Uuid7.generate(), tenantId.value(), citationId,
                stored.storageKey(), stored.contentType(), stored.byteSize(), stored.sha256(), captured, latitude,
                longitude, actor.userIdValue(), now);
        evidence = evidenceRepository.save(evidence);
        citationService.recordEvidenceAttached(citation, actor, now);
        return evidence;
    }

    @Transactional
    public CitationEvidence attachNote(TenantId tenantId, EnforcementActor actor, UUID citationId, String note) {
        Citation citation = citationService.require(tenantId, citationId);
        requireOpen(citation);
        if (note == null || note.isBlank()) {
            throw new ValidationException("note", ErrorCode.VALIDATION_FAILED, "error.enforcement.evidence.empty");
        }
        if (note.length() > policy.maxNoteLength()) {
            throw new ValidationException("note", ErrorCode.VALIDATION_FAILED, "error.enforcement.evidence.noteTooLong");
        }
        Instant now = clock.instant();
        CitationEvidence evidence = evidenceRepository.save(CitationEvidence.note(Uuid7.generate(), tenantId.value(),
                citationId, note.trim(), actor.userIdValue(), now));
        citationService.recordEvidenceAttached(citation, actor, now);
        return evidence;
    }

    /**
     * A photograph the citizen attached to their defence.
     *
     * <p>Same store, same digest, same header-based type check as the officer's — it is the same kind
     * of proof — with two differences that are deliberate. The size limit is <b>lower</b>
     * ({@link EvidencePolicy#maxAppealImageBytes()}, 1 MB): the client is expected to compress, but
     * the client is not the one that decides, and a defence arrives from any phone on any network.
     * And the count allowed is the <b>municipality's</b> setting, not a platform constant, because the
     * people who read these images are the ones who should say how many they want.</p>
     */
    @Transactional
    public CitationEvidence attachAppealPhoto(TenantId tenantId, EnforcementActor actor, CitationAppeal appeal,
                                              int maxImages, byte[] content, String originalFilename,
                                              Instant capturedAt, BigDecimal latitude, BigDecimal longitude) {
        if (content == null || content.length == 0) {
            throw new ValidationException("file", ErrorCode.VALIDATION_FAILED, "error.enforcement.evidence.empty");
        }
        if (content.length > policy.maxAppealImageBytes()) {
            throw new ValidationException("file", ErrorCode.EVIDENCE_TOO_LARGE,
                    "error.enforcement.evidence.appealTooLarge");
        }
        String contentType = ImageSniffer.sniff(content)
                .filter(policy::allows)
                .orElseThrow(() -> new ValidationException("file", ErrorCode.EVIDENCE_TYPE_NOT_ALLOWED,
                        "error.enforcement.evidence.typeNotAllowed"));
        long attached = evidenceRepository.countByTenantIdAndAppealIdAndKind(tenantId.value(), appeal.getId(),
                EvidenceKind.PHOTO);
        if (attached >= maxImages) {
            throw ConflictException.of(ErrorCode.EVIDENCE_LIMIT_REACHED, "error.enforcement.evidence.limitReached");
        }

        Instant now = clock.instant();
        Instant captured = capturedAt == null ? now : capturedAt;
        EvidenceStorage.Stored stored = storage.store(tenantId, appeal.getCitationId(),
                new EvidenceStorage.Upload(content, contentType, originalFilename, captured,
                        latitude == null ? null : latitude.doubleValue(),
                        longitude == null ? null : longitude.doubleValue()));
        CitationEvidence evidence = CitationEvidence.appealPhoto(Uuid7.generate(), tenantId.value(),
                appeal.getCitationId(), appeal.getId(), stored.storageKey(), stored.contentType(),
                stored.byteSize(), stored.sha256(), captured, latitude, longitude, actor.userIdValue(), now);
        return evidenceRepository.save(evidence);
    }

    /** Everything the citizen attached to one defence. */
    @Transactional(readOnly = true)
    public List<CitationEvidence> listForAppeal(TenantId tenantId, UUID appealId) {
        return evidenceRepository.findByTenantIdAndAppealIdOrderByCreatedAtAsc(tenantId.value(), appealId);
    }

    @Transactional(readOnly = true)
    public List<CitationEvidence> list(TenantId tenantId, UUID citationId) {
        return evidenceRepository.findByTenantIdAndCitationIdOrderByCreatedAtAsc(tenantId.value(), citationId);
    }

    /**
     * Reads one file back. The key never comes from the client: it is looked up on a row that is
     * already narrowed by tenant and citation, which is what makes path traversal and cross-tenant
     * reads impossible here rather than merely unlikely.
     */
    @Transactional(readOnly = true)
    public EvidenceStorage.Content read(TenantId tenantId, UUID citationId, UUID evidenceId) {
        CitationEvidence evidence = evidenceRepository
                .findByTenantIdAndCitationIdAndId(tenantId.value(), citationId, evidenceId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.EVIDENCE_NOT_FOUND,
                        "error.enforcement.evidence.notFound"));
        if (evidence.getKind() != EvidenceKind.PHOTO || evidence.getStorageKey() == null) {
            throw NotFoundException.of(ErrorCode.EVIDENCE_NOT_FOUND, "error.enforcement.evidence.notFound");
        }
        Optional<EvidenceStorage.Content> content = storage.read(tenantId, evidence.getStorageKey());
        return content.orElseThrow(() -> NotFoundException.of(ErrorCode.EVIDENCE_NOT_FOUND,
                "error.enforcement.evidence.notFound"));
    }

    private void requireOpen(Citation citation) {
        if (citation.getStatus().isTerminal()) {
            throw ConflictException.of(ErrorCode.CITATION_NOT_EDITABLE, "error.enforcement.citation.closed");
        }
    }
}
