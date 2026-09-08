package cr.luparx.app.web;

import cr.luparx.core.error.ErrorCode;
import cr.luparx.core.error.NotFoundException;
import cr.luparx.core.id.TenantId;
import cr.luparx.tenancy.entity.Tenant;
import cr.luparx.tenancy.model.TenantBranding;
import cr.luparx.tenancy.service.TenantService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Locale;
import java.util.UUID;

/**
 * Draws the placeholder logo of a municipality that has not provided its own emblem: its initials
 * over its brand colour, as an SVG.
 *
 * <h2>Why the platform draws it at all</h2>
 *
 * <p>A municipality's coat of arms is its own official emblem. It is not ours to invent, to
 * approximate or to ship in a fixture, and the real one is uploaded by the municipality from its
 * admin panel. Until then the product still has to render a grid of icons, so it renders a
 * monogram.</p>
 *
 * <p>A client could draw that monogram itself — and the citizen app does, whenever {@code logoUrl}
 * comes back null. This endpoint exists for everything that cannot: an email, a PDF receipt, an
 * {@code <img>} with no JavaScript behind it, a third-party embed. One monogram, drawn the same way
 * for all of them, instead of every client inventing its own.</p>
 *
 * <h2>Why SVG</h2>
 *
 * <p>It is a few hundred bytes, it is sharp at every size a picker or a top bar might use, and it is
 * produced without an image library or a font file. The text is the only part that comes from tenant
 * content, and it is escaped — an SVG is a document, and a display name with an {@code &} in it must
 * not be able to close a tag.</p>
 *
 * <p>Public, like the rest of the catalogue: a login screen needs it before anybody has a token, and
 * a municipality's initials and colour disclose nothing its own website does not. Suspended and
 * closed municipalities answer 404, exactly as they do everywhere else in the catalogue, so the
 * endpoint cannot be used to enumerate them.</p>
 */
@RestController
@RequestMapping("/api/v1/catalog/tenants")
@Tag(name = "Catalog", description = "Public reference data.")
public class TenantLogoController {

    /** Square, and small enough that a picker can lay out a dozen without thinking about it. */
    private static final int SIZE = 128;

    /** A monogram is one or two letters. Three is a word, and a word does not fit in a circle. */
    private static final int MAX_INITIALS = 2;

    /** The colour drawn behind the initials when the municipality has not picked one. */
    private static final String FALLBACK_COLOR = "#334155";

    /**
     * Cached hard: this image changes only when a municipality changes its name or its colour, and a
     * stale monogram for an hour is not a defect anybody would notice. Public, because it is the same
     * bytes for every caller — there is nothing tenant-private in a set of initials.
     */
    private static final Duration CACHE_TTL = Duration.ofHours(24);

    private final TenantService tenantService;

    public TenantLogoController(TenantService tenantService) {
        this.tenantService = tenantService;
    }

    /** The path this controller serves for a municipality; the one place that spelling lives. */
    public static String pathFor(UUID tenantId) {
        return "/api/v1/catalog/tenants/" + tenantId + "/logo.svg";
    }

    @GetMapping(value = "/{id}/logo.svg", produces = "image/svg+xml")
    @Operation(summary = "Placeholder logo of a municipality: its initials over its brand colour")
    public ResponseEntity<String> logo(@PathVariable UUID id) {
        Tenant tenant = tenantService.require(TenantId.of(id));
        if (!tenant.getStatus().allowsAccess()) {
            // Same answer as a municipality that does not exist: a different one would confirm the
            // identifier is real (SECURITY.md §1).
            throw NotFoundException.of(ErrorCode.TENANT_NOT_FOUND, "error.tenant.notFound");
        }
        String color = TenantBranding.normalizeColor(tenant.getBrandColor());
        String initials = initialsOf(tenant.getShortName() == null
                ? tenant.getDisplayName()
                : tenant.getShortName());
        return ResponseEntity.ok()
                .contentType(MediaType.valueOf("image/svg+xml"))
                .cacheControl(CacheControl.maxAge(CACHE_TTL).cachePublic())
                .body(render(initials, color == null ? FALLBACK_COLOR : color));
    }

    /**
     * The initials of a name: the first letter of each of its first two <em>significant</em> words.
     *
     * <p>A word is insignificant when it starts with a lower-case letter. That is not a trick — it is
     * how the languages this platform is likely to meet mark their particles: "Montes <b>de</b> Oca"
     * gives MO, "<b>La</b> Unión" gives LU because its article is capitalised and part of the name,
     * and the same rule handles <i>van</i>, <i>da</i> and <i>du</i> without anybody maintaining a
     * list of Spanish stop words that the next language would invalidate.</p>
     *
     * <p>Anything not starting with a letter or a digit is skipped outright, so punctuation never
     * becomes an initial.</p>
     */
    static String initialsOf(String name) {
        if (name == null || name.isBlank()) {
            return "?";
        }
        StringBuilder initials = new StringBuilder(MAX_INITIALS);
        for (String word : name.trim().split("\\s+")) {
            char first = word.isEmpty() ? ' ' : word.charAt(0);
            if (!Character.isLetterOrDigit(first) || Character.isLowerCase(first)) {
                continue;
            }
            initials.append(Character.toUpperCase(first));
            if (initials.length() == MAX_INITIALS) {
                break;
            }
        }
        return initials.length() == 0
                ? name.trim().substring(0, 1).toUpperCase(Locale.ROOT)
                : initials.toString();
    }

    /**
     * A rounded square of the brand colour with the initials centred on it.
     *
     * <p>The font is named as a generic family rather than a specific face: the SVG is rendered by
     * whatever is looking at it, and asking for a font that machine may not have would give one
     * result in a browser and another in a PDF renderer.</p>
     */
    private static String render(String initials, String color) {
        return """
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %1$d %1$d" width="%1$d" height="%1$d" \
                role="img" aria-label="%2$s">
                  <rect width="%1$d" height="%1$d" rx="%3$d" fill="%4$s"/>
                  <text x="50%%" y="50%%" dy="0.35em" text-anchor="middle" fill="#ffffff" \
                font-family="system-ui, sans-serif" font-size="%5$d" font-weight="600">%2$s</text>
                </svg>
                """.formatted(SIZE, escape(initials), SIZE / 5, color,
                initials.length() > 1 ? SIZE / 2 : (SIZE * 3) / 5);
    }

    /** An SVG is a document: tenant content goes in escaped or it goes in as markup. */
    private static String escape(String value) {
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
