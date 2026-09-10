package cr.luparx.enforcement.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * A document backing a permit ({@code exemption_documents}, V29_0): the disability assessment, the
 * council agreement, the letter.
 *
 * <p>Same shape as {@code CitationEvidence} and for the same reason: whoever questions an exemption
 * years later is entitled to see what it rested on. The bytes live behind the same storage port the
 * citation photographs use; this row is the trace — key, type, size and digest — and it is never
 * deleted from the application, because it is the basis on which a vehicle was not fined.</p>
 */
@Entity
@Table(name = "exemption_documents")
public class ExemptionDocument {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "exemption_id", nullable = false)
    private UUID exemptionId;

    /** What the officer says it is: an assessment, an agreement, a note. Free text, like the reason. */
    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "storage_key", nullable = false, length = 400)
    private String storageKey;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "byte_size", nullable = false)
    private long byteSize;

    @Column(name = "sha256", nullable = false, length = 64)
    private String sha256;

    @Column(name = "uploaded_by", nullable = false)
    private UUID uploadedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ExemptionDocument() {
        // for JPA
    }

    public ExemptionDocument(UUID id, UUID tenantId, UUID exemptionId, String title, String storageKey,
                             String contentType, long byteSize, String sha256, UUID uploadedBy,
                             Instant createdAt) {
        this.id = id;
        this.tenantId = tenantId;
        this.exemptionId = exemptionId;
        this.title = title;
        this.storageKey = storageKey;
        this.contentType = contentType;
        this.byteSize = byteSize;
        this.sha256 = sha256;
        this.uploadedBy = uploadedBy;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public UUID getExemptionId() {
        return exemptionId;
    }

    public String getTitle() {
        return title;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getContentType() {
        return contentType;
    }

    public long getByteSize() {
        return byteSize;
    }

    public String getSha256() {
        return sha256;
    }

    public UUID getUploadedBy() {
        return uploadedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
