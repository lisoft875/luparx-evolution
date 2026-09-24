package cr.luparx.app.config;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.SerializerProvider;
import cr.luparx.core.domain.Portal;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.util.Locale;

/**
 * JSON conventions of the API.
 *
 * <ul>
 *   <li>{@code null} members are omitted, which is what RFC 9457 expects of an unused Problem
 *       Details member and keeps optional DTO fields out of the wire format;</li>
 *   <li>temporal values are ISO-8601 strings, never epoch numbers, so an {@code Instant} is
 *       unambiguous and always UTC;</li>
 *   <li>a {@link Portal} travels as its slug — {@code "inspector"}, not {@code "INSPECTOR"}.</li>
 * </ul>
 */
@Configuration
public class JacksonConfiguration {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer luparxJacksonCustomizer() {
        // `modules(...)` would REPLACE the auto-configured module list (including the parameter-names
        // module records rely on), so only the settings that actually differ are customised.
        // `serializerByType` / `deserializerByType` are additive and leave that list alone.
        return builder -> builder
                .serializationInclusion(JsonInclude.Include.NON_NULL)
                .featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .serializerByType(Portal.class, new PortalSerializer())
                .deserializerByType(Portal.class, new PortalDeserializer());
    }

    /**
     * Writes a portal as its slug (24-09-2026).
     *
     * <h2>What it was before, and what that cost</h2>
     *
     * <p>Jackson's default for an enum is {@code name()}, so a membership reached the browser as
     * {@code "portal":"INSPECTOR"} while the client's own {@code Portal} type, the URLs it builds
     * ({@code /api/v1/inspector/...}), the {@code portal} claim in the JWT and the translation keys
     * all say {@code inspector}. Two halves of one platform disagreeing about the same word.</p>
     *
     * <p>Nothing failed loudly, which is why it lived this long. What it did instead, all of it
     * found in the testing of 24-09-2026: {@code member.portal === 'inspector'} matched nothing, so
     * the "change role" dialog offered an empty list and read as a post with no alternative roles —
     * when in fact there are two; the enforcement screens listed no inspectors to filter by at all;
     * and {@code t(`portal.${p}`)} printed the raw key {@code portal.INSPECTOR} into the dialog
     * text. There was already a case-insensitive workaround in the client's session code, and its
     * comment said what the real fix was: for the wire shape and the type to agree.</p>
     *
     * <h2>Why here and not an annotation on the enum</h2>
     *
     * <p>Because {@code platform-core} is deliberately framework-free — no Spring, no JPA, no HTTP —
     * so that every bounded context can depend on it without dragging infrastructure along. How a
     * value is written onto an HTTP body is an HTTP concern and belongs in the module that speaks
     * HTTP. An {@code @JsonValue} on the enum would have been one import and a hole in that rule.</p>
     */
    private static final class PortalSerializer extends JsonSerializer<Portal> {
        @Override
        public void serialize(Portal value, JsonGenerator generator, SerializerProvider providers)
                throws IOException {
            generator.writeString(value.slug());
        }
    }

    /**
     * Reads a portal from either spelling.
     *
     * <p>Tolerant coming in, exact going out. Anything that still sends {@code "INSPECTOR"} — an
     * older client, a stored payload, a request somebody typed by hand against the OpenAPI page —
     * must not start failing on the day the serialisation changed. An unknown value is still an
     * error, and the message names what was received rather than saying "invalid".</p>
     */
    private static final class PortalDeserializer extends JsonDeserializer<Portal> {
        @Override
        public Portal deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            String raw = parser.getValueAsString();
            if (raw == null || raw.isBlank()) {
                return null;
            }
            String value = raw.trim();
            return Portal.fromSlug(value).orElseGet(() -> {
                try {
                    return Portal.valueOf(value.toUpperCase(Locale.ROOT));
                } catch (IllegalArgumentException unknown) {
                    throw new IllegalArgumentException("Unknown portal: " + value);
                }
            });
        }
    }
}
