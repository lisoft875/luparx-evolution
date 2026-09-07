package cr.luparx.app.security;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/**
 * Turns the {@code roles[]} and {@code perms[]} claims into Spring authorities.
 *
 * <p>Permissions become {@code PERM_*} authorities and are what endpoints actually check
 * ({@code @PreAuthorize("hasAuthority('PERM_USER_READ')")}); roles become {@code ROLE_*} and exist
 * for logging and for the rare rule that is genuinely about a role. Authorizing on permissions keeps
 * "what a role can do" in {@code RolePermissions} instead of scattered across controllers
 * (SECURITY.md §3).</p>
 */
public class PortalAuthoritiesConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        Collection<GrantedAuthority> authorities = new ArrayList<>();
        for (String role : claimAsList(jwt, "roles")) {
            authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
        }
        for (String permission : claimAsList(jwt, "perms")) {
            authorities.add(new SimpleGrantedAuthority("PERM_" + permission));
        }
        return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
    }

    private List<String> claimAsList(Jwt jwt, String claim) {
        List<String> values = jwt.getClaimAsStringList(claim);
        return values == null ? List.of() : values;
    }
}
