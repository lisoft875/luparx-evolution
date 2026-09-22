package cr.luparx.app.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Security policy of the payment edge — its own chain, on purpose (ADR 0023).
 *
 * <h2>Por qué no va en PUBLIC_PATHS de SecurityConfig</h2>
 *
 * <p>A provider's webhook is not "public" in the sense a catalogue is. It is <b>authenticated, by a
 * different mechanism</b>: a signature over the request body, verified by the adapter of the provider
 * named in the path. Listing it beside the catalogues would say it needs no authentication, which is the
 * wrong thing for the next person to read — the one route that can end in money moving deserves to have
 * its policy written where its reason is written too.</p>
 *
 * <p>What the chain grants is narrow: this path, no session, no CSRF token (there is no cookie to
 * protect and the caller is a server), and no tenant filter — the municipality is a <em>result</em> of
 * looking the payment reference up, never an input from the caller.</p>
 *
 * <p>Ordered between the public chains (1, 2) and the portals (10+): a portal chain must never match
 * these paths, and these must never fall through to the deny-all fallback.</p>
 */
@Configuration
public class PaymentEdgeSecurityConfig {

    /**
     * The provider notification endpoint.
     *
     * <p>{@code permitAll} at the filter chain and authenticated inside the handler, which is the only
     * shape available: Spring Security cannot verify an HMAC over a body it has not read, and the
     * verification has to happen over the exact bytes received.</p>
     */
    @Bean
    @Order(3)
    public SecurityFilterChain paymentWebhookChain(HttpSecurity http) throws Exception {
        http.securityMatcher("/api/v1/webhooks/payments/**")
                .cors(cors -> cors.disable())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests.anyRequest().permitAll());
        return http.build();
    }

    /**
     * The simulated provider's payment page — development only.
     *
     * <p>Only registered under the {@code dev} profile, so in every other profile the routes do not
     * exist and answer 404 rather than 403: there is no code path to reach, which is stronger than a flag
     * checked inside a handler. It is public because a real provider's page is on a domain of its own
     * and carries no session of ours; the rehearsal has to be faithful about that too.</p>
     */
    @Bean
    @Order(4)
    @Profile({"dev", "demo"})
    public SecurityFilterChain simulatedCheckoutChain(HttpSecurity http) throws Exception {
        http.securityMatcher("/dev/payments/**")
                .cors(cors -> cors.disable())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests.anyRequest().permitAll());
        return http.build();
    }
}
