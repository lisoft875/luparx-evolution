package cr.luparx.app.config;

import cr.luparx.core.domain.Portal;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.format.FormatterRegistry;
import org.springframework.lang.NonNull;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Locale;

/**
 * Lets a {@code portal} query parameter be written the way the rest of the platform writes it.
 *
 * <h2>The defect this closes (24-09-2026)</h2>
 *
 * <p>Spring converts an enum request parameter with {@code Enum.valueOf}, which is case-sensitive.
 * So {@code GET /admin/users?portal=inspector} — the exact request the Usuarios screen builds, from
 * a list of slugs — answered <b>400</b>, while {@code ?portal=INSPECTOR} worked. The filter had
 * never filtered.</p>
 *
 * <p>It is the same disagreement that was making memberships arrive as {@code "INSPECTOR"} (see
 * {@link JacksonConfiguration}), reaching the other door: one of them is the request body, this one
 * is the query string, and fixing only the first would have left the screen still answering 400.</p>
 *
 * <p>Both spellings are accepted, for the same reason the deserialiser accepts both: a URL somebody
 * already has in a bookmark or a script must not stop working today.</p>
 */
@Configuration
public class PortalParameterConfiguration implements WebMvcConfigurer {

    @Override
    public void addFormatters(@NonNull FormatterRegistry registry) {
        registry.addConverter(new StringToPortal());
    }

    private static final class StringToPortal implements Converter<String, Portal> {
        @Override
        public Portal convert(@NonNull String source) {
            String value = source.trim();
            if (value.isEmpty()) {
                return null;
            }
            return Portal.fromSlug(value).orElseGet(() -> Portal.valueOf(value.toUpperCase(Locale.ROOT)));
        }
    }
}
