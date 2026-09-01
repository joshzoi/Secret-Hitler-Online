package server.auth;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * The sign-ins that have been started but not yet come back from Slack.
 *
 * Each one is remembered under a random "state" that Slack echoes to the
 * callback. The entry is removed the first time it is used, so a callback cannot
 * be replayed, and it carries where to send the player afterwards -- which is
 * kept here rather than routed through Slack so it cannot be tampered with into
 * an open redirect.
 *
 * The state is also written to a short-lived cookie. Requiring both means a
 * callback has to arrive in the same browser that started the sign-in, which is
 * what stops someone feeding a player their own authorization code and quietly
 * signing them in as somebody else.
 */
public class PendingAuthStore {

    private static final SecureRandom RANDOM = new SecureRandom();
    /** Long enough to read a consent screen, short enough to be worthless later. */
    private static final long TTL_MILLIS = 10 * 60 * 1000L;

    public static class PendingAuth {
        public final String nonce;
        public final String returnTo;
        final long createdAt;

        PendingAuth(String nonce, String returnTo, long createdAt) {
            this.nonce = nonce;
            this.returnTo = returnTo;
            this.createdAt = createdAt;
        }
    }

    private static final ConcurrentHashMap<String, PendingAuth> pending = new ConcurrentHashMap<>();

    /** Starts a sign-in and returns the state that identifies it. */
    public static String start(String nonce, String returnTo) {
        String state = randomToken();
        pending.put(state, new PendingAuth(nonce, returnTo, System.currentTimeMillis()));
        return state;
    }

    /**
     * Takes the sign-in matching a state, removing it so it cannot be used twice.
     *
     * @return the pending sign-in, or null if unknown or too old.
     */
    public static PendingAuth take(String state) {
        if (state == null || state.isEmpty()) {
            return null;
        }
        PendingAuth auth = pending.remove(state);
        if (auth == null) {
            return null;
        }
        if (System.currentTimeMillis() - auth.createdAt > TTL_MILLIS) {
            return null;
        }
        return auth;
    }

    /** Drops sign-ins nobody came back from. */
    public static void removeExpired() {
        long cutoff = System.currentTimeMillis() - TTL_MILLIS;
        for (Map.Entry<String, PendingAuth> entry : pending.entrySet()) {
            if (entry.getValue().createdAt < cutoff) {
                pending.remove(entry.getKey());
            }
        }
    }

    /** 256 bits of randomness, URL-safe so it can go straight in a query string. */
    public static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
