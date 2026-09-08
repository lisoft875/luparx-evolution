package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Development seeding switches ({@code luparx.dev.*}), read only by {@link DevDataSeeder} and
 * {@link DevParkingSeeder}, which exist under the {@code dev} profile alone.
 *
 * <p>Both components are wrappers on purpose: an absent property binds to {@code null} rather than
 * to {@code 0} or {@code false}, so "not configured" and "configured to zero" stay distinguishable
 * and the defaults below are applied deliberately instead of by accident. The size of the fixture is
 * configuration rather than a constant in Java precisely so that a developer can ask for 50 bays
 * while debugging a list screen and for the full set when exercising pagination.</p>
 *
 * @param seedDemoData  whether the seeders run at all; also read by {@code @ConditionalOnProperty}
 * @param parkingSpaces how many bays the parking fixture creates, clamped to
 *                      {@link #MAXIMUM_PARKING_SPACES}
 */
@ConfigurationProperties(prefix = "luparx.dev")
public record DevSeedProperties(Boolean seedDemoData, Integer parkingSpaces) {

    /** Used when {@code luparx.dev.parking-spaces} is absent or not a positive number. */
    public static final int DEFAULT_PARKING_SPACES = 5_000;

    /**
     * Upper bound of the fixture. Not a limit of the schema — {@code parking_spaces.code} is text and
     * accepts any short code a municipality paints — but the point beyond which a development fixture
     * stops being a fixture and starts being a load test.
     */
    public static final int MAXIMUM_PARKING_SPACES = 10_000;
}
