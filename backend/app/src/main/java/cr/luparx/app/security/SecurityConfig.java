package cr.luparx.app.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import cr.luparx.app.config.JwtProperties;
import cr.luparx.app.config.SecurityProperties;
import cr.luparx.core.domain.Portal;
import cr.luparx.identity.port.JwtKeySource;
import cr.luparx.identity.repository.UserRepository;
import cr.luparx.tenancy.service.AccessResolver;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.util.List;
import java.util.Map;

/**
 * Security topology: one filter chain per portal plus two public chains.
 *
 * <p>Splitting the chains is what makes the portals genuinely separate rather than four URL prefixes
 * over one security policy (ADR 0004). Each portal chain installs its <em>own</em> JWT decoder,
 * bound to that portal's audience, so a token cannot be replayed across portals even if the caller
 * knows the other portal's routes.</p>
 *
 * <p>Everything is stateless: no session, no CSRF token (there is no cookie-based authentication to
 * protect), and the same chain works on any instance behind the load balancer.</p>
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private static final String[] PUBLIC_PATHS = {
            "/api/v1/catalog/**",
            // Accepting a staff invitation (CONTRACT.md v0.27). Public by necessity, exactly like the
            // password-reset routes: the person following the link has no account yet, so there is no
            // token they could present. What stands in for authentication is the token in the link
            // itself — single-use, hashed at rest, short-lived — and everything the request can
            // affect comes from the stored invitation rather than from the body.
            "/api/v1/invitations/**",
            "/.well-known/**",
            // The servlet container's ERROR dispatch must not be denied, or a genuine error would be
            // rewritten into a 403 by the fallback chain.
            "/error",
            "/actuator/health",
            "/actuator/health/**",
            "/actuator/info",
            "/v3/api-docs",
            "/v3/api-docs/**",
            "/swagger-ui.html",
            "/swagger-ui/**"
    };

    @Bean
    public PortalJwtDecoders portalJwtDecoders(JwtKeySource keySource, JwtProperties jwtProperties) {
        return new PortalJwtDecoders(keySource, jwtProperties.issuer());
    }

    @Bean
    public PortalAuthoritiesConverter portalAuthoritiesConverter() {
        return new PortalAuthoritiesConverter();
    }

    @Bean
    public TenantContextFilter tenantContextFilter(
            AccessResolver accessResolver,
            UserRepository userRepository,
            @Qualifier("handlerExceptionResolver") HandlerExceptionResolver resolver) {
        return new TenantContextFilter(accessResolver, userRepository, resolver);
    }

    /*
     * The filter above is a Filter bean, which Spring Boot would otherwise register a second time in
     * the plain servlet chain, where it would run for public routes as well. It belongs only inside
     * the portal security chains, so its automatic registration is switched off.
     */

    @Bean
    public FilterRegistrationBean<TenantContextFilter> tenantContextFilterRegistration(
            TenantContextFilter filter) {
        FilterRegistrationBean<TenantContextFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    // --- public chains ---------------------------------------------------------------------------

    /** Catalogues, JWKS, health and the OpenAPI document: readable without a token. */
    @Bean
    @Order(1)
    public SecurityFilterChain publicChain(HttpSecurity http, CorsConfigurationSource corsConfigurationSource)
            throws Exception {
        http.securityMatcher(PUBLIC_PATHS)
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests.anyRequest().permitAll());
        applySecurityHeaders(http);
        return http.build();
    }

    /**
     * Authentication endpoints. Public by necessity — they are how a caller obtains a token — and
     * protected instead by the database-backed login rate limiter (SECURITY.md §2).
     */
    @Bean
    @Order(2)
    public SecurityFilterChain authChain(HttpSecurity http, CorsConfigurationSource corsConfigurationSource)
            throws Exception {
        http.securityMatcher("/api/v1/auth/**")
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .anyRequest().permitAll());
        applySecurityHeaders(http);
        return http.build();
    }

    // --- portal chains ---------------------------------------------------------------------------

    @Bean
    @Order(10)
    public SecurityFilterChain citizenChain(HttpSecurity http, CorsConfigurationSource corsConfigurationSource,
                                            PortalJwtDecoders decoders, PortalAuthoritiesConverter converter,
                                            TenantContextFilter tenantContextFilter,
                                            ObjectMapper objectMapper) throws Exception {
        return portalChain(http, Portal.CITIZEN, corsConfigurationSource, decoders, converter, tenantContextFilter,
                objectMapper);
    }

    @Bean
    @Order(11)
    public SecurityFilterChain adminChain(HttpSecurity http, CorsConfigurationSource corsConfigurationSource,
                                          PortalJwtDecoders decoders, PortalAuthoritiesConverter converter,
                                          TenantContextFilter tenantContextFilter,
                                          ObjectMapper objectMapper) throws Exception {
        return portalChain(http, Portal.ADMIN, corsConfigurationSource, decoders, converter, tenantContextFilter,
                objectMapper);
    }

    @Bean
    @Order(12)
    public SecurityFilterChain inspectorChain(HttpSecurity http, CorsConfigurationSource corsConfigurationSource,
                                              PortalJwtDecoders decoders, PortalAuthoritiesConverter converter,
                                              TenantContextFilter tenantContextFilter,
                                                ObjectMapper objectMapper) throws Exception {
        return portalChain(http, Portal.INSPECTOR, corsConfigurationSource, decoders, converter, tenantContextFilter,
                objectMapper);
    }

    @Bean
    @Order(13)
    public SecurityFilterChain platformChain(HttpSecurity http, CorsConfigurationSource corsConfigurationSource,
                                             PortalJwtDecoders decoders, PortalAuthoritiesConverter converter,
                                             TenantContextFilter tenantContextFilter,
                                              ObjectMapper objectMapper) throws Exception {
        return portalChain(http, Portal.PLATFORM, corsConfigurationSource, decoders, converter, tenantContextFilter,
                objectMapper);
    }

    /** Anything not matched above is denied rather than silently permitted. */
    @Bean
    @Order(100)
    public SecurityFilterChain fallbackChain(HttpSecurity http, ObjectMapper objectMapper) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests.anyRequest().denyAll())
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(new ProblemAuthenticationEntryPoint(objectMapper))
                        .accessDeniedHandler(new ProblemAccessDeniedHandler(objectMapper)));
        applySecurityHeaders(http);
        return http.build();
    }

    private SecurityFilterChain portalChain(HttpSecurity http, Portal portal,
                                            CorsConfigurationSource corsConfigurationSource,
                                            PortalJwtDecoders decoders,
                                            PortalAuthoritiesConverter converter,
                                            TenantContextFilter tenantContextFilter,
                                            ObjectMapper objectMapper) throws Exception {
        http.securityMatcher(PortalRoutes.pattern(portal))
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt
                                .decoder(decoders.forPortal(portal))
                                .jwtAuthenticationConverter(converter))
                        .authenticationEntryPoint(new ProblemAuthenticationEntryPoint(objectMapper))
                        .accessDeniedHandler(new ProblemAccessDeniedHandler(objectMapper)))
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint(new ProblemAuthenticationEntryPoint(objectMapper))
                        .accessDeniedHandler(new ProblemAccessDeniedHandler(objectMapper)))
                // The filter needs an authenticated token, so it runs after the bearer token filter
                // (which Spring Security places immediately before BasicAuthenticationFilter).
                .addFilterAfter(tenantContextFilter, BasicAuthenticationFilter.class);
        applySecurityHeaders(http);
        return http.build();
    }

    /** Baseline response headers required by SECURITY.md §6 on every backend response. */
    private void applySecurityHeaders(HttpSecurity http) throws Exception {
        http.headers(headers -> headers
                .contentTypeOptions(Customizer.withDefaults())
                .frameOptions(frame -> frame.deny())
                .referrerPolicy(referrer -> referrer
                        .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                .httpStrictTransportSecurity(hsts -> hsts
                        .includeSubDomains(true)
                        .maxAgeInSeconds(31536000))
                .contentSecurityPolicy(csp -> csp
                        // The API returns JSON only; nothing may be loaded or framed from it.
                        .policyDirectives("default-src 'none'; frame-ancestors 'none'; base-uri 'none'")));
        // Permissions-Policy is written by StaticSecurityHeadersFilter, which applies to every
        // response including the ones produced before a chain is selected.
    }

    /**
     * CORS is configured per portal origin, never as one shared wildcard: an origin serving the
     * citizen app is not authorized to call {@code /api/v1/admin/**} at the browser level either
     * (SECURITY.md §7 — defence in depth on top of audience validation).
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource(SecurityProperties securityProperties) {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        Map<String, List<String>> configured = securityProperties.corsAllowedOrigins() == null
                ? Map.of()
                : securityProperties.corsAllowedOrigins();

        for (Portal portal : Portal.values()) {
            List<String> origins = configured.getOrDefault(portal.slug(), List.of());
            CorsConfiguration configuration = baseCors(origins);
            source.registerCorsConfiguration(PortalRoutes.pattern(portal), configuration);
            source.registerCorsConfiguration(PortalRoutes.authPattern(portal), configuration);
        }

        // Public catalogues are readable by every portal origin (and only by those).
        List<String> allOrigins = configured.values().stream().flatMap(List::stream).distinct().toList();
        source.registerCorsConfiguration("/api/v1/catalog/**", baseCors(allOrigins));
        source.registerCorsConfiguration("/.well-known/**", baseCors(allOrigins));
        return source;
    }

    private CorsConfiguration baseCors(List<String> origins) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(origins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        // Cache-Control is on the list because a browser is entitled to send it on a request — a
        // "reload" does — and a preflight that refuses a header the client had every right to use
        // fails invisibly: the request never leaves, and fetch rejects with a bare "Failed to fetch"
        // that says nothing about which header was the problem. The list should admit what is
        // reasonable rather than break silently.
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "Accept-Language",
                "Cache-Control", "Idempotency-Key", RequestCorrelationFilter.REQUEST_ID_HEADER));
        configuration.setExposedHeaders(List.of(RequestCorrelationFilter.REQUEST_ID_HEADER, "Retry-After"));
        configuration.setAllowCredentials(false);
        configuration.setMaxAge(3600L);
        return configuration;
    }
}
