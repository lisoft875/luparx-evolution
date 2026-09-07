package cr.luparx.app.config;

import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import cr.luparx.identity.port.JwtKeySource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * Loads the RS256 key material from PEM files supplied by the deployment environment
 * (SECURITY.md §5: never from the repository).
 *
 * <p>Retired public keys stay in the published JWKS so that access tokens signed just before a
 * rotation keep verifying until they expire — that is what makes key rotation a zero-downtime
 * operation instead of a mass logout.</p>
 */
public class RsaJwtKeySource implements JwtKeySource {

    private static final Logger LOGGER = LoggerFactory.getLogger(RsaJwtKeySource.class);

    private final RSAKey activeKey;
    private final JWKSet publicJwkSet;

    public RsaJwtKeySource(JwtProperties properties) {
        try {
            RSAPrivateKey privateKey = readPrivateKey(Path.of(properties.privateKeyPath()));
            RSAPublicKey publicKey = readPublicKey(Path.of(properties.publicKeyPath()));
            this.activeKey = new RSAKey.Builder(publicKey)
                    .privateKey(privateKey)
                    .keyID(properties.keyId())
                    .keyUse(KeyUse.SIGNATURE)
                    .build();

            List<JWK> published = new ArrayList<>();
            published.add(activeKey.toPublicJWK());
            if (properties.previousPublicKeyPaths() != null) {
                for (String entry : properties.previousPublicKeyPaths()) {
                    if (entry == null || entry.isBlank()) {
                        continue;
                    }
                    // Format: "<kid>:<path>"
                    int separator = entry.indexOf(':');
                    if (separator <= 0) {
                        LOGGER.warn("Ignoring malformed previous JWT key entry (expected '<kid>:<path>')");
                        continue;
                    }
                    String kid = entry.substring(0, separator).trim();
                    Path path = Path.of(entry.substring(separator + 1).trim());
                    RSAPublicKey retired = readPublicKey(path);
                    published.add(new RSAKey.Builder(retired).keyID(kid).keyUse(KeyUse.SIGNATURE).build());
                }
            }
            this.publicJwkSet = new JWKSet(published);
        } catch (IOException | GeneralSecurityException exception) {
            // Failing at startup is the correct behaviour: an instance that cannot sign tokens must
            // not join the load balancer pool.
            throw new IllegalStateException("unable to load JWT signing keys", exception);
        }
    }

    @Override
    public RSAKey activeKey() {
        return activeKey;
    }

    @Override
    public JWKSet publicJwkSet() {
        return publicJwkSet;
    }

    private static RSAPrivateKey readPrivateKey(Path path) throws IOException, GeneralSecurityException {
        byte[] der = decodePem(Files.readString(path, StandardCharsets.UTF_8));
        KeyFactory factory = KeyFactory.getInstance("RSA");
        return (RSAPrivateKey) factory.generatePrivate(new PKCS8EncodedKeySpec(der));
    }

    private static RSAPublicKey readPublicKey(Path path) throws IOException, GeneralSecurityException {
        byte[] der = decodePem(Files.readString(path, StandardCharsets.UTF_8));
        KeyFactory factory = KeyFactory.getInstance("RSA");
        return (RSAPublicKey) factory.generatePublic(new X509EncodedKeySpec(der));
    }

    private static byte[] decodePem(String pem) {
        String base64 = pem.replaceAll("-----BEGIN [A-Z ]+-----", "")
                .replaceAll("-----END [A-Z ]+-----", "")
                .replaceAll("\\s", "");
        return Base64.getDecoder().decode(base64);
    }
}
