package cr.luparx.enforcement.port;

import cr.luparx.core.id.TenantId;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Where the photographs that back a citation are kept.
 *
 * <p>A port, because the bytes do not belong in the database and the place they do belong depends on
 * the deployment: a directory on disk in development, an object store (S3, GCS, Azure Blob, MinIO)
 * in production, possibly a municipality's own storage where the law requires evidence to stay
 * inside its infrastructure. The domain must not know which — it only needs to hand over bytes and
 * get back a key it can store, and to hand a key back and get the bytes.</p>
 *
 * <p><b>Where an object store plugs in.</b> Implement this interface against the SDK and register it
 * as the {@code EvidenceStorage} bean; {@code FilesystemEvidenceStorage} in the application module is
 * the development implementation and the reference for what a correct one must do. Two things any
 * implementation owes the caller: the returned {@link Stored#sha256()} must be computed over the
 * bytes actually written (it is what proves months later that the photograph was not swapped), and
 * the key must be opaque to the client — never a URL, never a path the browser can guess. Signed
 * URLs, if a deployment wants them, are produced by that implementation from the key, not stored
 * instead of it.</p>
 */
public interface EvidenceStorage {

    /**
     * Writes one file and returns what has to be recorded about it. Implementations do not validate
     * the content type or the size — the calling service does that first, so that every storage
     * backend enforces exactly the same rules.
     *
     * @param ownerId the act the file belongs to: a citation since v0.6, a permit since v0.30. It is
     *                used to group the stored objects and nothing else; an implementation must not
     *                read anything into which of the two it is
     */
    Stored store(TenantId tenantId, UUID ownerId, Upload upload);

    /** Reads a file back for the officer, the administrator or the citizen who is entitled to see it. */
    Optional<Content> read(TenantId tenantId, String storageKey);

    /**
     * Bytes offered for storage. {@code capturedAt} and the coordinates come from the device and are
     * kept as declared: they are what the officer says about when and where the photograph was taken.
     */
    record Upload(byte[] content, String contentType, String originalFilename, Instant capturedAt,
                  Double latitude, Double longitude) {
    }

    /** What the domain records about a stored file. */
    record Stored(String storageKey, String contentType, long byteSize, String sha256) {
    }

    /** A file read back out of the store. */
    record Content(byte[] content, String contentType, long byteSize) {
    }
}
