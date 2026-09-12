package cr.luparx.app.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Deployment settings of the card edge ({@code luparx.payments.*} — ADR 0023).
 *
 * <h2>Lo que está aquí y lo que no</h2>
 *
 * <p>Infrastructure decisions only: which adapter is wired, how long a hand-off stays good for, how
 * hard the sweep tries. What a municipality charges, whether it takes cards at all and into which
 * account the money lands are <b>municipal</b> decisions and belong in the tenant's own rows — the same
 * separation as the parking policy, and for the same reason: a council must not need an operator to
 * change its own settings, and an operator must not need a deploy to move a timeout.</p>
 *
 * <p>Every value has a working default, so a deployment that says nothing gets the simulator and can
 * run the whole citizen journey. That is deliberate: the demonstration to a municipality must not
 * depend on a contract with a gateway.</p>
 *
 * @param provider         identifier of the gateway adapter to wire, matching
 *                         {@code PaymentGateway#providerId()} case-insensitively. {@code simulated}
 *                         by default, and it is the only one that needs no credentials
 * @param checkoutTtl      how long a hand-off stays good for. Twenty minutes: long enough to find a
 *                         card and read a 3-D Secure message, short enough that an abandoned attempt
 *                         resolves while the citizen still remembers making it
 * @param minTopupMinor    smallest top-up in minor units. A floor exists because every provider
 *                         charges a fixed fee per transaction, and below some amount the municipality
 *                         pays to receive money
 * @param maxTopupMinor    largest single top-up in minor units. A ceiling is an anti-fraud measure and
 *                         a guard against a typo turning ₡5.000 into ₡500.000
 * @param pollInterval     how long to leave a hand-off alone between questions to the provider
 * @param maxPollAttempts  after this many unanswered questions the row is left for a person. A
 *                         provider that has stopped answering must not become an unbounded loop
 * @param sweepBatchSize   how many hand-offs one pass of the job looks at
 * @param returnPath       path on the citizen portal the provider sends people back to. The origin
 *                         comes from {@code luparx.mail.base-urls.citizen}, which is the same portal
 *                         base URL the emails use — one place to be right about
 * @param apiBaseUrl       public base URL of this API, used to build the URL of the simulated
 *                         checkout page and nothing else. A real provider's page is on its own domain,
 *                         so this is configuration the simulator needs and the real adapters will not
 */
@ConfigurationProperties(prefix = "luparx.payments")
public record PaymentsProperties(String provider,
                                 Duration checkoutTtl,
                                 Long minTopupMinor,
                                 Long maxTopupMinor,
                                 Duration pollInterval,
                                 Integer maxPollAttempts,
                                 Integer sweepBatchSize,
                                 String returnPath,
                                 String apiBaseUrl) {

    /** The adapter that needs no contract with anybody. */
    public static final String SIMULATED = "simulated";

    private static final Duration DEFAULT_TTL = Duration.ofMinutes(20);
    private static final Duration DEFAULT_POLL_INTERVAL = Duration.ofMinutes(2);
    /** ₡500 in colones, and the same integer in any currency with two decimals. */
    private static final long DEFAULT_MIN_MINOR = 50_000L;
    /** ₡200.000. High enough for a fleet's month, low enough that a typo is caught. */
    private static final long DEFAULT_MAX_MINOR = 20_000_000L;
    private static final int DEFAULT_MAX_POLLS = 20;
    private static final int DEFAULT_BATCH = 100;
    private static final String DEFAULT_RETURN_PATH = "/wallet/topup/return";
    /** The development port of this API (docs/PORTS.md: service default + 10). */
    private static final String DEFAULT_API_BASE_URL = "http://localhost:8090";

    public PaymentsProperties {
        provider = provider == null || provider.isBlank() ? SIMULATED : provider.trim();
        checkoutTtl = checkoutTtl == null || checkoutTtl.isZero() || checkoutTtl.isNegative()
                ? DEFAULT_TTL
                : checkoutTtl;
        minTopupMinor = minTopupMinor == null || minTopupMinor <= 0L ? DEFAULT_MIN_MINOR : minTopupMinor;
        maxTopupMinor = maxTopupMinor == null || maxTopupMinor <= 0L ? DEFAULT_MAX_MINOR : maxTopupMinor;
        pollInterval = pollInterval == null || pollInterval.isNegative()
                ? DEFAULT_POLL_INTERVAL
                : pollInterval;
        maxPollAttempts = maxPollAttempts == null || maxPollAttempts <= 0 ? DEFAULT_MAX_POLLS : maxPollAttempts;
        sweepBatchSize = sweepBatchSize == null || sweepBatchSize <= 0 ? DEFAULT_BATCH : sweepBatchSize;
        returnPath = returnPath == null || returnPath.isBlank() ? DEFAULT_RETURN_PATH : returnPath.trim();
        apiBaseUrl = apiBaseUrl == null || apiBaseUrl.isBlank()
                ? DEFAULT_API_BASE_URL
                : apiBaseUrl.trim().replaceAll("/+$", "");
        // A ceiling below the floor would refuse every amount, silently. Better to be obviously wrong
        // at startup than to have a municipality unable to take money and no message saying why.
        if (maxTopupMinor < minTopupMinor) {
            throw new IllegalArgumentException(
                    "luparx.payments.max-topup-minor must not be below min-topup-minor");
        }
    }

    public boolean isSimulated() {
        return SIMULATED.equalsIgnoreCase(provider);
    }
}
