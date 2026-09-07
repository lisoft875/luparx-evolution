package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Outgoing message configuration ({@code luparx.mail.*}).
 *
 * @param fromAddress envelope sender for transactional email
 * @param baseUrls    per-portal front-end base URL used to build the links inside messages, so a
 *                    verification link opens the portal the person actually registered on
 */
@ConfigurationProperties(prefix = "luparx.mail")
public record MailProperties(String fromAddress, java.util.Map<String, String> baseUrls) {
}
