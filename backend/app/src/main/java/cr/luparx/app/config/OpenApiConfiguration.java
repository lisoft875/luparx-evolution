package cr.luparx.app.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/**
 * OpenAPI document served at {@code /v3/api-docs} (ADR 0011).
 *
 * <p>The generated document is a technical mirror of CONTRACT.md, never a replacement for it: where
 * the two disagree, CONTRACT.md wins until it is explicitly updated.</p>
 */
@Configuration
public class OpenApiConfiguration {

    @Bean
    public OpenAPI luparxOpenApi(JwtProperties jwtProperties) {
        return new OpenAPI()
                .info(new Info()
                        .title("LupaRX API")
                        .version("v1")
                        .description("""
                                Multi-tenant municipal parking-enforcement platform.
                                Four login-isolated portals (citizen, admin, inspector, platform):
                                an access token minted for one portal is rejected on the others.
                                Errors follow RFC 9457 (application/problem+json) with a stable `code`.
                                """)
                        .license(new License().name("Proprietary")))
                .servers(List.of(new Server().url("/").description("This deployment")))
                .components(new Components().addSecuritySchemes("bearerAuth", new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                        .description("RS256 access token issued by " + jwtProperties.issuer()
                                + "; `aud` and `portal` must match the portal prefix of the route.")));
    }
}
