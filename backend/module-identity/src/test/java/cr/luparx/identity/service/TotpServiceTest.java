package cr.luparx.identity.service;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TOTP must interoperate with off-the-shelf authenticator apps, so it is verified against the
 * official RFC 6238 test vectors rather than against itself (ADR 0007).
 *
 * <p>The RFC's SHA-1 secret is the ASCII string {@code 12345678901234567890}, which is
 * {@code GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ} in Base32.</p>
 */
class TotpServiceTest {

    private static final String RFC6238_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    private final TotpService service = new TotpService();

    @Test
    void matchesTheRfc6238VectorAt59Seconds() {
        assertThat(service.generateCode(RFC6238_SECRET, Instant.ofEpochSecond(59L))).isEqualTo("287082");
    }

    @Test
    void matchesTheRfc6238VectorAt1111111109Seconds() {
        assertThat(service.generateCode(RFC6238_SECRET, Instant.ofEpochSecond(1111111109L))).isEqualTo("081804");
    }

    @Test
    void matchesTheRfc6238VectorAt1234567890Seconds() {
        assertThat(service.generateCode(RFC6238_SECRET, Instant.ofEpochSecond(1234567890L))).isEqualTo("005924");
    }

    @Test
    void acceptsTheCodeOfTheCurrentStep() {
        Instant now = Instant.ofEpochSecond(1_700_000_000L);
        String code = service.generateCode(RFC6238_SECRET, now);

        assertThat(service.verify(RFC6238_SECRET, code, now)).isTrue();
    }

    @Test
    void toleratesOneStepOfClockDriftInEitherDirection() {
        Instant now = Instant.ofEpochSecond(1_700_000_000L);
        String previous = service.generateCode(RFC6238_SECRET, now.minusSeconds(TotpService.PERIOD_SECONDS));
        String next = service.generateCode(RFC6238_SECRET, now.plusSeconds(TotpService.PERIOD_SECONDS));

        assertThat(service.verify(RFC6238_SECRET, previous, now)).isTrue();
        assertThat(service.verify(RFC6238_SECRET, next, now)).isTrue();
    }

    @Test
    void refusesCodesOutsideTheAcceptedWindow() {
        Instant now = Instant.ofEpochSecond(1_700_000_000L);
        String tooOld = service.generateCode(RFC6238_SECRET, now.minusSeconds(3L * TotpService.PERIOD_SECONDS));

        assertThat(service.verify(RFC6238_SECRET, tooOld, now)).isFalse();
    }

    @Test
    void refusesMalformedInput() {
        Instant now = Instant.ofEpochSecond(1_700_000_000L);

        assertThat(service.verify(RFC6238_SECRET, "12345", now)).isFalse();
        assertThat(service.verify(RFC6238_SECRET, "abcdef", now)).isFalse();
        assertThat(service.verify(RFC6238_SECRET, null, now)).isFalse();
        assertThat(service.verify(null, "123456", now)).isFalse();
    }

    @Test
    void toleratesSpacesTheUserTypes() {
        Instant now = Instant.ofEpochSecond(1_700_000_000L);
        String code = service.generateCode(RFC6238_SECRET, now);

        assertThat(service.verify(RFC6238_SECRET, code.substring(0, 3) + " " + code.substring(3), now)).isTrue();
    }

    @Test
    void generatesAUsableSecretAndOtpauthUri() {
        String secret = service.generateSecret();

        assertThat(secret).matches("^[A-Z2-7]{32}$");
        String uri = service.buildOtpauthUri("LupaRX", "person@example.com", secret);
        assertThat(uri).startsWith("otpauth://totp/LupaRX:person%40example.com?secret=" + secret);
        assertThat(uri).contains("algorithm=SHA1").contains("digits=6").contains("period=30");
        // A freshly generated secret must produce a code its own verifier accepts.
        Instant now = Instant.ofEpochSecond(1_700_000_000L);
        assertThat(service.verify(secret, service.generateCode(secret, now), now)).isTrue();
    }
}
