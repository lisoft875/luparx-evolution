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
 * @param seedDemoData       whether the seeders run at all; also read by {@code @ConditionalOnProperty}
 * @param parkingSpaces      how many bays the LAUNCH municipality (San José) creates, clamped to
 *                           {@link #MAXIMUM_PARKING_SPACES}
 * @param parkingSpacesTotal how many bays are shared out among the OTHER seeded municipalities, dealt
 *                           between them by weight rather than given to each — five municipalities
 *                           with five thousand bays each would be a load test, not a fixture
 */
@ConfigurationProperties(prefix = "luparx.dev")
public record DevSeedProperties(Boolean seedDemoData, Integer parkingSpaces, Integer parkingSpacesTotal) {

    /** Used when {@code luparx.dev.parking-spaces} is absent or not a positive number. */
    public static final int DEFAULT_PARKING_SPACES = 5_000;

    /**
     * Bays shared out among the municipalities added after the launch one, when
     * {@code luparx.dev.parking-spaces-total} is absent or not positive.
     *
     * <p>A pool and not a per-municipality figure: the four are dealt this total in proportion to
     * their size, so the number of municipalities can grow without the fixture growing linearly with
     * it. The split with the default value is Escazú 1200, Montes de Oca 1500, La Unión 900 and
     * Cartago 1400 — weights 24/30/18/28 in {@code DevMunicipalities}.</p>
     */
    public static final int DEFAULT_PARKING_SPACES_TOTAL = 5_000;

    /**
     * Upper bound of the fixture. Not a limit of the schema — {@code parking_spaces.code} is text and
     * accepts any short code a municipality paints — but the point beyond which a development fixture
     * stops being a fixture and starts being a load test.
     *
     * <p>Applies to each municipality on its own, not to the pool.</p>
     *
     * <p>9999 and not 10000: the codes are zero-padded to four digits and the launch municipality's
     * bay-code format is four digits ({@code platform.defaults.parking.space-code-digits}), so a
     * ten-thousandth bay would be the one code in the fixture that its own municipality refuses
     * (CONTRACT.md v0.3, "Formato del código de espacio").</p>
     */
    public static final int MAXIMUM_PARKING_SPACES = 9_999;
}
