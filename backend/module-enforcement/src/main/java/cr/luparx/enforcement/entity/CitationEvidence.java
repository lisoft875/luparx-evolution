package cr.luparx.enforcement.entity;

import cr.luparx.enforcement.model.EvidenceKind;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A photograph or a note backing a citation ({@code citation_evidence}, V17_0).
 *
 * <p>The bytes are not here. What is here is everything needed to find them again and to prove they
 * are the same bytes: the opaque storage key, the content type as <em>verified</em> from the file's
 * own header (never from the name the device sent), the size, and the SHA-256 of the content. The
 * hash is the point of the row — months later, "this is the photograph that was taken" is a claim
 * somebody will dispute, and a digest recorded at capture time is what answers it.</p>
 *
 * <p>{@code capturedAt} and the coordinates are what the device declared about the photograph, kept
 * separately from the citation's own moment and place: a photograph taken two streets away, or an
 * hour later, is a fact a defence is entitled to see rather than one the platform smooths over.</p>
 */
@Entity
@Table(name = "citation_evidence")
public class CitationEvidence {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "citation_id", nullable = false)
    private UUID citationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 16)
    private EvidenceKind kind;

    /** Opaque key in the evidence store. Never a URL and never a path a client may construct. */
    @Column(name = "storage_key", length = 400)
    private String storageKey;

    @Column(name = "content_type", length = 100)
    private String contentType;

    @Column(name = "byte_size")
    private Long byteSize;

    @Column(name = "sha256", length = 64)
    private String sha256;

    @Column(name = "note", length = 2000)
    private String note;

    @Column(name = "captured_at")
    private Instant capturedAt;

    @Column(name = "latitude", precision = 9, scale = 6)
    private BigDecimal latitude;

    @Column(name = "longitude", precision = 9, scale = 6)
    private BigDecimal longitude;

    @Column(name = "uploaded_by", nullable = false)
    private UUID uploadedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected CitationEvidence() {
        // for JPA
    }

    public static CitationEvidence photo(UUID id, UUID tenantId, UUID citationId, String storageKey,
                                         String contentType, long byteSize, String sha256, Instant capturedAt,
                                         BigDecimal latitude, BigDecimal longitude, UUID uploadedBy, Instant now) {
        CitationEvidence evidence = new CitationEvidence();
        evidence.id = id;
        evidence.tenantId = tenantId;
        evidence.citationId = citationId;
        evidence.kind = EvidenceKind.PHOTO;
        evidence.storageKey = storageKey;
        evidence.contentType = contentType;
        evidence.byteSize = byteSize;
        evidence.sha256 = sha256;
        evidence.capturedAt = capturedAt;
        evidence.latitude = latitude;
        evidence.longitude = longitude;
        evidence.uploadedBy = uploadedBy;
        evidence.createdAt = now;
        return evidence;
    }

    public static CitationEvidence note(UUID id, UUID tenantId, UUID citationId, String note, UUID uploadedBy,
                                        Instant now) {
        CitationEvidence evidence = new CitationEvidence();
        evidence.id = id;
        evidence.tenantId = tenantId;
        evidence.citationId = citationId;
        evidence.kind = EvidenceKind.NOTE;
        evidence.note = note;
        evidence.uploadedBy = uploadedBy;
        evidence.capturedAt = now;
        evidence.createdAt = now;
        return evidence;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getCitationId() {
        return citationId;
    }

    public EvidenceKind getKind() {
        return kind;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getContentType() {
        return contentType;
    }

    public Long getByteSize() {
        return byteSize;
    }

    public String getSha256() {
        return sha256;
    }

    public String getNote() {
        return note;
    }

    public Instant getCapturedAt() {
        return capturedAt;
    }

    public BigDecimal getLatitude() {
        return latitude;
    }

    public BigDecimal getLongitude() {
        return longitude;
    }

    public UUID getUploadedBy() {
        return uploadedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
