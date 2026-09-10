package cr.luparx.core.audit;

import java.util.Locale;

/**
 * A {@code User-Agent} header reduced to the one phrase a person can read (CONTRACT.md v0.33).
 *
 * <p>"IP/dispositivo cuando aplique" is only worth recording if somebody can use it. The header
 * itself is four hundred characters of version strings that nobody reads in a table cell, so the
 * trail keeps the header — it is evidence and must not be paraphrased away — and this renders it as
 * {@code Chrome 128 · Android}, which is what an auditor is actually asking: was this the officer's
 * assigned handheld, or somebody's laptop at midnight.</p>
 *
 * <h2>Deliberately crude</h2>
 *
 * <p>No library and no exhaustive table. User agents are self-declared strings a client may put
 * anything in, so a parser that tried to be authoritative would be lying about a value it cannot
 * trust. This recognises the handful of families the platform's own applications run on, and answers
 * {@code null} for everything else so the screen falls back to the raw header rather than inventing a
 * confident wrong name.</p>
 *
 * <p>Order matters and is not alphabetical: Edge and Opera both carry {@code Chrome} in their header,
 * and Chrome carries {@code Safari}, so the more specific family has to be tested first. Getting this
 * backwards is the classic bug in every hand-written user-agent parser.</p>
 *
 * <p>This is <b>not</b> part of the seal digest. It is derived from a stored value at read time, so a
 * future improvement here changes what the screen says and cannot change what the chain proves — a
 * property worth keeping deliberately.</p>
 */
public final class DeviceSummary {

    private DeviceSummary() {
    }

    /**
     * @return something like {@code Chrome 128 · Android}, or null when the header is absent or is
     *         not a shape this recognises. Null is a real answer: a scheduled job has no device.
     */
    public static String of(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return null;
        }
        String agent = userAgent.trim();
        String browser = browserOf(agent);
        String platform = platformOf(agent);
        if (browser == null && platform == null) {
            return null;
        }
        if (browser == null) {
            return platform;
        }
        return platform == null ? browser : browser + " · " + platform;
    }

    private static String browserOf(String agent) {
        // Most specific first: Edge and Opera impersonate Chrome, and Chrome impersonates Safari.
        if (agent.contains("LupaRX/")) {
            return named("LupaRX", versionAfter(agent, "LupaRX/"));
        }
        if (agent.contains("Edg/")) {
            return named("Edge", versionAfter(agent, "Edg/"));
        }
        if (agent.contains("OPR/")) {
            return named("Opera", versionAfter(agent, "OPR/"));
        }
        if (agent.contains("Chrome/")) {
            return named("Chrome", versionAfter(agent, "Chrome/"));
        }
        if (agent.contains("Firefox/")) {
            return named("Firefox", versionAfter(agent, "Firefox/"));
        }
        if (agent.contains("Safari/") || agent.contains("AppleWebKit/")) {
            return "Safari";
        }
        if (agent.toLowerCase(Locale.ROOT).contains("curl/")) {
            return "curl";
        }
        return null;
    }

    private static String platformOf(String agent) {
        // Android is tested before Linux: every Android header says Linux too.
        if (agent.contains("Android")) {
            return "Android";
        }
        if (agent.contains("iPhone")) {
            return "iPhone";
        }
        if (agent.contains("iPad")) {
            return "iPad";
        }
        if (agent.contains("Windows")) {
            return "Windows";
        }
        if (agent.contains("Mac OS X") || agent.contains("Macintosh")) {
            return "macOS";
        }
        if (agent.contains("Linux")) {
            return "Linux";
        }
        return null;
    }

    /** The family alone when no version could be read: "Chrome " with nothing after it reads as a bug. */
    private static String named(String family, String version) {
        return version.isEmpty() ? family : family + " " + version;
    }

    /**
     * The major version only.
     *
     * <p>{@code 128} and not {@code 128.0.6613.120}: the patch level says nothing about who was
     * holding the device, and a column that changes every fortnight makes two entries from the same
     * handheld look like two different ones.</p>
     */
    private static String versionAfter(String agent, String token) {
        int start = agent.indexOf(token) + token.length();
        int end = start;
        while (end < agent.length() && Character.isDigit(agent.charAt(end))) {
            end++;
        }
        return end == start ? "" : agent.substring(start, end);
    }
}
