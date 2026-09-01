package server;

import java.util.Arrays;

public class ApplicationConfig {
    private static final String ENV_DEBUG = "DEBUG_MODE";
    private static final String ENV_DATABASE_URL = "DATABASE_URL";
    private static final String ENV_ALLOWED_ORIGINS = "ALLOWED_ORIGINS";
    private static final String ENV_PUBLIC_ORIGIN = "PUBLIC_ORIGIN";
    private static final String ENV_SLACK_CLIENT_ID = "SLACK_CLIENT_ID";
    private static final String ENV_SLACK_CLIENT_SECRET = "SLACK_CLIENT_SECRET";
    private static final String ENV_SLACK_TEAM_ID = "SLACK_TEAM_ID";
    private static final String ENV_SESSION_TTL_HOURS = "SESSION_TTL_HOURS";

    private static final String DEFAULT_ALLOWED_ORIGINS = "https://secret-hitler.online";
    /** Long enough that a group playing weekly is not asked to sign in again. */
    private static final long DEFAULT_SESSION_TTL_HOURS = 24 * 30;
    /** Where Slack sends the player back to once they have approved the sign-in. */
    public static final String SLACK_CALLBACK_PATH = "/auth/slack/callback";

    public static boolean DEBUG = System.getenv(ENV_DEBUG) != null;
    public static String DATABASE_URI = System.getenv(ENV_DATABASE_URL);

    /*
     * Everything below is a method rather than a static field. ApplicationTest sets
     * DEBUG after this class is initialised, so a field computed from it here would
     * be fixed at false before the development server ever flips it.
     */

    /**
     * The origins that the browser is allowed to make cross-origin requests from.
     * Set via the ALLOWED_ORIGINS environment variable as a comma-separated list of
     * full origins, including the scheme and without a trailing slash
     * (e.g. "https://insertyourdomainhere.com,https://www.insertyourdomainhere.com").
     *
     * Note that this only applies when the frontend is served from a different
     * origin than the backend. Behind a reverse proxy that serves both under a
     * single hostname the requests are same-origin, and CORS never comes into play.
     *
     * @return the configured origins, or the public site if none were provided.
     */
    public static String[] getAllowedOrigins() {
        String origins = System.getenv(ENV_ALLOWED_ORIGINS);
        if (origins == null || origins.trim().isEmpty()) {
            origins = DEFAULT_ALLOWED_ORIGINS;
        }
        return Arrays.stream(origins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toArray(String[]::new);
    }

    /**
     * The origin players reach this deployment at, with the scheme and no trailing
     * slash (e.g. "https://insertyourdomainhere.com").
     *
     * @return the configured origin, or null if none was provided.
     */
    public static String publicOrigin() {
        String origin = System.getenv(ENV_PUBLIC_ORIGIN);
        if (origin == null || origin.trim().isEmpty()) {
            return null;
        }
        origin = origin.trim();
        while (origin.endsWith("/")) {
            origin = origin.substring(0, origin.length() - 1);
        }
        return origin;
    }

    public static String slackClientId() {
        return System.getenv(ENV_SLACK_CLIENT_ID);
    }

    public static String slackClientSecret() {
        return System.getenv(ENV_SLACK_CLIENT_SECRET);
    }

    /** The one Slack workspace whose members may sign in. */
    public static String slackTeamId() {
        return System.getenv(ENV_SLACK_TEAM_ID);
    }

    /**
     * Where Slack should return the player after they approve the sign-in. Slack
     * compares this byte for byte against the value sent when the code is
     * exchanged, so both come from here.
     *
     * Deliberately built from PUBLIC_ORIGIN rather than the request. The Host and
     * X-Forwarded-Proto headers are both set by whatever is in front of us, and
     * the scheme decides whether the session cookie is marked Secure.
     *
     * @return the redirect URI, or null if PUBLIC_ORIGIN is not configured.
     */
    public static String slackRedirectUri() {
        String origin = publicOrigin();
        return origin == null ? null : origin + SLACK_CALLBACK_PATH;
    }

    /**
     * Whether the session cookie should be marked Secure, which browsers require
     * before they will store it over HTTPS and which stops it being sent in clear.
     * A development server runs over plain http, where the flag would mean the
     * cookie is never stored at all.
     */
    public static boolean cookieSecure() {
        String origin = publicOrigin();
        return origin != null && origin.startsWith("https://");
    }

    /** How long a sign-in lasts before the player has to authenticate again. */
    public static long sessionTtlSeconds() {
        String hours = System.getenv(ENV_SESSION_TTL_HOURS);
        long value = DEFAULT_SESSION_TTL_HOURS;
        if (hours != null && !hours.trim().isEmpty()) {
            try {
                value = Long.parseLong(hours.trim());
            } catch (NumberFormatException e) {
                value = DEFAULT_SESSION_TTL_HOURS;
            }
        }
        if (value <= 0) {
            value = DEFAULT_SESSION_TTL_HOURS;
        }
        return value * 60 * 60;
    }

    /** Whether Slack sign-in has everything it needs to run. */
    public static boolean isSlackConfigured() {
        return isPresent(slackClientId())
                && isPresent(slackClientSecret())
                && isPresent(slackTeamId())
                && isPresent(publicOrigin());
    }

    private static boolean isPresent(String value) {
        return value != null && !value.trim().isEmpty();
    }

    /**
     * Checks the configuration the server cannot run correctly without, and stops
     * the process if it is wrong.
     *
     * Signing in is the only way to play, so a deployment missing its Slack
     * credentials cannot do anything at all. Failing at startup with a message
     * says so plainly; booting and turning every player away does not.
     *
     * @param errorStream where to report what is wrong.
     * @return true if the configuration is usable.
     */
    public static boolean validate(java.io.PrintStream errorStream) {
        if (DEBUG) {
            // A deployment that still has DEBUG_MODE set gets development's CORS
            // policy and its unauthenticated sign-in route, which is worse than not
            // starting. Localhost is the one place both are meant to be true.
            String origin = publicOrigin();
            if (origin != null && origin.startsWith("https://")) {
                errorStream.println("DEBUG_MODE is set alongside PUBLIC_ORIGIN=" + origin + ".");
                errorStream.println("That would expose the development sign-in route on a real deployment.");
                errorStream.println("Unset DEBUG_MODE, or point PUBLIC_ORIGIN at localhost.");
                return false;
            }
            return true;
        }

        boolean valid = true;
        if (!isPresent(slackClientId()) || !isPresent(slackClientSecret())) {
            errorStream.println("SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be set. "
                    + "Create a Slack app with \"Sign in with Slack\" enabled to get them.");
            valid = false;
        }
        if (!isPresent(slackTeamId())) {
            errorStream.println("SLACK_TEAM_ID must be set to the workspace allowed to sign in (e.g. T01ABCDEFGH).");
            valid = false;
        }
        String origin = publicOrigin();
        if (!isPresent(origin)) {
            errorStream.println("PUBLIC_ORIGIN must be set to the address players reach this server at, "
                    + "e.g. https://insertyourdomainhere.com. It builds the Slack redirect URI.");
            valid = false;
        } else if (!origin.startsWith("https://")) {
            errorStream.println("PUBLIC_ORIGIN must use https. Slack refuses to redirect back to a plain "
                    + "http address, so sign-in could never complete. Got: " + origin);
            valid = false;
        }
        return valid;
    }
}
