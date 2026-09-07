package cr.luparx.identity.port;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;

/**
 * Output port supplying the RSA keys used to sign access tokens. Implemented in the {@code app}
 * module, which loads them from the deployment environment's secret store — never from the
 * repository (SECURITY.md §5).
 *
 * <p>Several keys may be published at once so that a signing key can be rotated without
 * invalidating the tokens signed by the previous one: the new key becomes {@link #activeKey()}
 * while the old one stays in {@link #publicJwkSet()} until its tokens have expired.</p>
 */
public interface JwtKeySource {

    /** Private key currently used for signing, carrying its {@code kid}. */
    RSAKey activeKey();

    /** Public half of every accepted key, served at {@code /.well-known/jwks.json}. */
    JWKSet publicJwkSet();
}
