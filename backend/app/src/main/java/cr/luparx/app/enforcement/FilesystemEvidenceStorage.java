package cr.luparx.app.enforcement;

import cr.luparx.app.config.EnforcementProperties;
import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.ValidationException;
import cr.luparx.core.id.TenantId;
import cr.luparx.core.id.Uuid7;
import cr.luparx.enforcement.port.EvidenceStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Evidence on the local filesystem — the development implementation of {@link EvidenceStorage}.
 *
 * <h2>Where an object store goes instead</h2>
 *
 * <p>This class is the whole surface a production store has to replace: write bytes, return a key and
 * a digest; read bytes back for a key. An S3/GCS/Azure implementation is that same pair against the
 * SDK plus a bucket name, registered as the {@code EvidenceStorage} bean in place of this one. Nothing
 * in {@code module-enforcement} changes, because nothing in it knows this class exists. What this
 * implementation is <b>not</b> suitable for is more than one instance: two backends behind a load
 * balancer do not share a local disk, so a deployment that scales horizontally must swap it — which
 * is exactly why the port exists rather than a {@code java.nio} call in the middle of a service.</p>
 *
 * <h2>Layout and path safety</h2>
 *
 * <p>{@code <root>/<tenant>/<yyyy>/<mm>/<owner>/<uuid>.<ext>}, the owner being the citation or, since
 * v0.30, the permit the file backs. Every segment is generated here —
 * identifiers and a UUID, never a filename the device sent — so a caller cannot steer the path. On the
 * way back the resolved path is checked to be inside the root before anything is read: keys come from
 * our own rows today, and the check is what keeps that true the day somebody adds an endpoint that
 * takes one from a request (SECURITY.md §4, path traversal).</p>
 */
@Component
public class FilesystemEvidenceStorage implements EvidenceStorage {

    private static final Logger LOGGER = LoggerFactory.getLogger(FilesystemEvidenceStorage.class);

    private static final Map<String, String> EXTENSIONS = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/webp", "webp",
            "image/heic", "heic",
            // Since v0.30: a permit's backing document is usually a scanned assessment or an agreement.
            "application/pdf", "pdf");

    private final Path root;

    public FilesystemEvidenceStorage(EnforcementProperties properties) {
        this.root = Path.of(properties.evidenceRoot()).toAbsolutePath().normalize();
        LOGGER.info("Evidence store: filesystem at {} (development implementation; swap EvidenceStorage "
                + "for an object store before running more than one instance)", root);
    }

    @Override
    public Stored store(TenantId tenantId, UUID ownerId, Upload upload) {
        String contentType = upload.contentType().toLowerCase(Locale.ROOT);
        String extension = EXTENSIONS.getOrDefault(contentType, "bin");
        ZonedDateTime moment = ZonedDateTime.ofInstant(
                upload.capturedAt() == null ? java.time.Instant.now() : upload.capturedAt(), ZoneOffset.UTC);
        String key = String.join("/",
                tenantId.value().toString(),
                String.format(Locale.ROOT, "%04d", moment.getYear()),
                String.format(Locale.ROOT, "%02d", moment.getMonthValue()),
                ownerId.toString(),
                Uuid7.generate() + "." + extension);

        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            // Written to a temporary neighbour and moved into place: a reader must never find a
            // half-written photograph, and a crash must not leave one behind under a real key.
            Path temporary = Files.createTempFile(target.getParent(), "upload-", ".part");
            Files.write(temporary, upload.content());
            Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException failure) {
            throw new UncheckedIOException("Could not store evidence for " + ownerId, failure);
        }
        return new Stored(key, contentType, upload.content().length, sha256Hex(upload.content()));
    }

    @Override
    public Optional<Content> read(TenantId tenantId, String storageKey) {
        Path path;
        try {
            path = resolve(storageKey);
        } catch (ValidationException rejected) {
            return Optional.empty();
        }
        // The key must belong to the municipality asking for it. The row it came from is already
        // tenant-scoped; this is the second lock on the same door, and it costs one comparison.
        if (!storageKey.startsWith(tenantId.value().toString() + "/")) {
            return Optional.empty();
        }
        if (!Files.isRegularFile(path)) {
            return Optional.empty();
        }
        try {
            byte[] content = Files.readAllBytes(path);
            return Optional.of(new Content(content, probeContentType(path), content.length));
        } catch (IOException failure) {
            throw new UncheckedIOException("Could not read evidence " + storageKey, failure);
        }
    }

    /** Resolves a key under the root and refuses anything that escapes it. */
    private Path resolve(String key) {
        Path resolved = root.resolve(key).normalize();
        if (!resolved.startsWith(root)) {
            throw new ValidationException("storageKey", ErrorCode.VALIDATION_FAILED,
                    "error.enforcement.evidence.key");
        }
        return resolved;
    }

    private String probeContentType(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        for (Map.Entry<String, String> entry : EXTENSIONS.entrySet()) {
            if (name.endsWith("." + entry.getValue())) {
                return entry.getKey();
            }
        }
        return "application/octet-stream";
    }

    private String sha256Hex(byte[] content) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(content);
            StringBuilder builder = new StringBuilder(digest.length * 2);
            for (byte value : digest) {
                builder.append(Character.forDigit((value >> 4) & 0xF, 16));
                builder.append(Character.forDigit(value & 0xF, 16));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException impossible) {
            // SHA-256 is required of every JVM; if it is missing the platform is not one.
            throw new IllegalStateException("SHA-256 is not available", impossible);
        }
    }
}
