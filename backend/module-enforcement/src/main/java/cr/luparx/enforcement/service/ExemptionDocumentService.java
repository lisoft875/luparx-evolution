package cr.luparx.enforcement.service;

import cr.luparx.core.error.ConflictException;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.UserId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.enforcement.entity.ExemptionDocument;
import cr.luparx.enforcement.entity.PlateExemption;
import cr.luparx.enforcement.model.DocumentPolicy;
import cr.luparx.enforcement.model.DocumentSniffer;
import cr.luparx.enforcement.port.EvidenceStorage;
import cr.luparx.enforcement.repository.ExemptionDocumentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * The paperwork a permit rests on: the disability assessment, the council agreement, the letter
 * (CONTRACT.md v0.30).
 *
 * <p>Files and not a written reference, which is what v0.28 had. "Acuerdo 12-2025" in a text field is
 * a promise that somebody, somewhere, still has the agreement; the file is the thing itself. What
 * makes an exemption defensible when it is questioned years later is being able to show what it was
 * granted on, and by then the person who typed the reference has moved on.</p>
 *
 * <h2>Same store, same integrity, different rules</h2>
 *
 * <p>The bytes go through the same {@link EvidenceStorage} port the citation photographs use — it is
 * the same kind of proof and it belongs in the same place — with the same digest recorded, which is
 * what distinguishes "this is the assessment that was submitted" from "this is a file somebody put
 * there afterwards". The limits are their own ({@link DocumentPolicy}), because a scanned assessment
 * is a multi-page PDF and a windscreen photograph is not.</p>
 *
 * <h2>Attached, never deleted</h2>
 *
 * <p>There is no removal here. A permit's documents are the basis on which a municipality decided not
 * to fine a vehicle; a screen that could quietly drop one is a screen that can rewrite why. A wrong
 * file is answered by attaching the right one, and both stay.</p>
 */
@Service
public class ExemptionDocumentService {

    private static final int MAX_TITLE = 200;

    private final ExemptionDocumentRepository documentRepository;
    private final PlateExemptionService exemptionService;
    private final EvidenceStorage storage;
    private final DocumentPolicy policy;
    private final Clock clock;

    public ExemptionDocumentService(ExemptionDocumentRepository documentRepository,
                                    PlateExemptionService exemptionService,
                                    EvidenceStorage storage,
                                    DocumentPolicy policy,
                                    Clock clock) {
        this.documentRepository = documentRepository;
        this.exemptionService = exemptionService;
        this.storage = storage;
        this.policy = policy;
        this.clock = clock;
    }

    public DocumentPolicy policy() {
        return policy;
    }

    @Transactional
    public ExemptionDocument attach(TenantId tenantId, UUID exemptionId, String title, byte[] content,
                                    String originalFilename, UserId actor) {
        PlateExemption exemption = exemptionService.requireInScope(tenantId, exemptionId);
        if (actor == null) {
            // "Who attached this" is part of what the document proves; an anonymous one proves less
            // than nothing, so it is refused rather than stored with an empty column.
            throw new ValidationException("actor", ErrorCode.VALIDATION_FAILED, "error.exemption.document.actor");
        }
        String trimmedTitle = title == null ? "" : title.trim();
        if (trimmedTitle.isEmpty() || trimmedTitle.length() > MAX_TITLE) {
            throw new ValidationException("title", ErrorCode.VALIDATION_FAILED, "error.exemption.document.title");
        }
        if (content == null || content.length == 0) {
            throw new ValidationException("file", ErrorCode.VALIDATION_FAILED, "error.exemption.document.empty");
        }
        if (content.length > policy.maxBytes()) {
            throw new ValidationException("file", ErrorCode.EVIDENCE_TOO_LARGE,
                    "error.exemption.document.tooLarge");
        }
        // Decided by the file's own header, never by its name or the type the browser declared.
        String contentType = DocumentSniffer.sniff(content)
                .filter(policy::allows)
                .orElseThrow(() -> new ValidationException("file", ErrorCode.EVIDENCE_TYPE_NOT_ALLOWED,
                        "error.exemption.document.typeNotAllowed"));
        long attached = documentRepository.countByTenantIdAndExemptionId(tenantId.value(), exemptionId);
        if (attached >= policy.maxDocumentsPerPermit()) {
            throw ConflictException.of(ErrorCode.EXEMPTION_DOCUMENT_LIMIT, "error.exemption.document.limitReached");
        }

        Instant now = clock.instant();
        EvidenceStorage.Stored stored = storage.store(tenantId, exemption.getId(),
                new EvidenceStorage.Upload(content, contentType, originalFilename, now, null, null));
        return documentRepository.save(new ExemptionDocument(Uuid7.generate(), tenantId.value(), exemptionId,
                trimmedTitle, stored.storageKey(), stored.contentType(), stored.byteSize(), stored.sha256(),
                actor.value(), now));
    }

    @Transactional(readOnly = true)
    public List<ExemptionDocument> list(TenantId tenantId, UUID exemptionId) {
        return documentRepository.findByTenantIdAndExemptionIdOrderByCreatedAtAsc(tenantId.value(), exemptionId);
    }

    /**
     * Reads one file back.
     *
     * <p>The storage key never comes from the client: it is read off a row already narrowed by tenant
     * and by permit, which is what makes a traversal or a cross-tenant read impossible here rather
     * than merely unlikely.</p>
     */
    @Transactional(readOnly = true)
    public Download read(TenantId tenantId, UUID exemptionId, UUID documentId) {
        ExemptionDocument document = documentRepository
                .findByTenantIdAndExemptionIdAndId(tenantId.value(), exemptionId, documentId)
                .orElseThrow(() -> NotFoundException.of(ErrorCode.EXEMPTION_DOCUMENT_NOT_FOUND,
                        "error.exemption.document.notFound"));
        Optional<EvidenceStorage.Content> content = storage.read(tenantId, document.getStorageKey());
        return content
                .map(found -> new Download(document, found))
                .orElseThrow(() -> NotFoundException.of(ErrorCode.EXEMPTION_DOCUMENT_NOT_FOUND,
                        "error.exemption.document.notFound"));
    }

    /** A stored document and its bytes, so the controller does not have to ask the store itself. */
    public record Download(ExemptionDocument document, EvidenceStorage.Content content) {
    }
}
