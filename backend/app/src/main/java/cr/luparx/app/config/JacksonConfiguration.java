package cr.luparx.app.config;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * JSON conventions of the API.
 *
 * <ul>
 *   <li>{@code null} members are omitted, which is what RFC 9457 expects of an unused Problem
 *       Details member and keeps optional DTO fields out of the wire format;</li>
 *   <li>temporal values are ISO-8601 strings, never epoch numbers, so an {@code Instant} is
 *       unambiguous and always UTC.</li>
 * </ul>
 */
@Configuration
public class JacksonConfiguration {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer luparxJacksonCustomizer() {
        // `modules(...)` would REPLACE the auto-configured module list (including the parameter-names
        // module records rely on), so only the two settings that actually differ are customised.
        return builder -> builder
                .serializationInclusion(JsonInclude.Include.NON_NULL)
                .featuresToDisable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }
}
