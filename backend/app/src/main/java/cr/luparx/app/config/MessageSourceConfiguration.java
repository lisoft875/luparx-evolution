package cr.luparx.app.config;

import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.support.ReloadableResourceBundleMessageSource;

import java.nio.charset.StandardCharsets;

/**
 * Message bundle behind every user-visible string produced by the backend: validation errors,
 * Problem Details titles and transactional emails (CONTRACT.md §7 — no hardcoded user text).
 *
 * <p>Fallback is deterministic: an unknown locale falls back to the bundle default, and a missing
 * key returns the key itself rather than an exception, so a translation gap degrades visibly
 * instead of breaking the response.</p>
 */
@Configuration
public class MessageSourceConfiguration {

    @Bean
    public MessageSource messageSource() {
        ReloadableResourceBundleMessageSource source = new ReloadableResourceBundleMessageSource();
        source.setBasename("classpath:messages");
        source.setDefaultEncoding(StandardCharsets.UTF_8.name());
        source.setUseCodeAsDefaultMessage(true);
        source.setFallbackToSystemLocale(false);
        return source;
    }
}
