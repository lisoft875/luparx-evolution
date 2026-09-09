package cr.luparx.core.time;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

/**
 * Every service takes a {@link Clock} as a constructor dependency instead of calling
 * {@code Instant.now()} directly, so that time-dependent behaviour (token expiry,
 * lockout windows) is deterministic under test. The application publishes a single UTC clock bean.
 */
public final class Clocks {

    private Clocks() {
    }

    public static Clock systemUtc() {
        return Clock.systemUTC();
    }

    /** Fixed clock for tests and for reproducible batch runs. */
    public static Clock fixedAt(Instant instant) {
        return Clock.fixed(instant, ZoneOffset.UTC);
    }
}
