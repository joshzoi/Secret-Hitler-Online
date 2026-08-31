package server;

import java.util.Arrays;

public class ApplicationConfig {
    private static final String ENV_DEBUG = "DEBUG_MODE";
    private static final String ENV_DATABASE_URL = "DATABASE_URL";
    private static final String ENV_ALLOWED_ORIGINS = "ALLOWED_ORIGINS";

    private static final String DEFAULT_ALLOWED_ORIGINS = "https://secret-hitler.online";

    public static boolean DEBUG = System.getenv(ENV_DEBUG) != null;
    public static String DATABASE_URI = System.getenv(ENV_DATABASE_URL);

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
}
