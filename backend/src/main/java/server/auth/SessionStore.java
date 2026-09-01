package server.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import server.ApplicationConfig;
import server.Database;

/**
 * Sign-in sessions, kept in memory and backed by Postgres so they survive a
 * restart.
 *
 * The cache is not an optimisation. Every database call opens its own connection
 * -- there is no pool -- and a session is looked up on every websocket handshake
 * and every REST call, so going to Postgres each time would put a connection
 * setup on the path of ordinary play.
 *
 * Only the SHA-256 of a token is ever stored. The token itself lives in the
 * player's cookie and nowhere else, so a leaked database dump cannot be replayed
 * as a live session. Hashing is unsalted on purpose: the input is 256 bits of
 * randomness, so there is nothing to guess and no reason to pay for bcrypt.
 */
public class SessionStore {

    private static Logger logger = LoggerFactory.getLogger(SessionStore.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32;

    /** tokenHash -> session. */
    private static final ConcurrentHashMap<String, UserSession> cache = new ConcurrentHashMap<>();

    /** A freshly minted session and the token that reaches the player's browser. */
    public static class IssuedSession {
        public final String token;
        public final UserSession session;

        IssuedSession(String token, UserSession session) {
            this.token = token;
            this.session = session;
        }
    }

    /**
     * Creates a session for a signed-in Slack user.
     *
     * @return the session, plus the raw token to put in the cookie. The token is
     *         not recoverable afterwards.
     */
    public static IssuedSession create(SlackProfile profile) {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        long now = System.currentTimeMillis();
        long expiresAt = now + (ApplicationConfig.sessionTtlSeconds() * 1000L);
        UserSession session = new UserSession(hash(token), profile.getUserId(), profile.getTeamId(),
                profile.getDisplayName(), profile.getGivenName(), profile.getFamilyName(),
                profile.getAvatarUrl(), now, expiresAt);

        cache.put(session.getTokenHash(), session);
        persist(session);
        return new IssuedSession(token, session);
    }

    /**
     * Looks up the session a token belongs to.
     *
     * @param token the raw token from the player's cookie, or null.
     * @return the session, or null if there is none, it has expired, or the token
     *         is not one of ours.
     */
    public static UserSession lookup(String token) {
        if (token == null || token.isEmpty()) {
            return null;
        }
        String tokenHash = hash(token);
        UserSession session = cache.get(tokenHash);
        if (session == null) {
            session = load(tokenHash);
            if (session != null) {
                cache.put(tokenHash, session);
            }
        }
        if (session == null) {
            return null;
        }
        if (session.isExpired(System.currentTimeMillis())) {
            revokeHash(tokenHash);
            return null;
        }
        return session;
    }

    /** Signs a player out, here and in the database. */
    public static void revoke(String token) {
        if (token == null || token.isEmpty()) {
            return;
        }
        revokeHash(hash(token));
    }

    private static void revokeHash(String tokenHash) {
        cache.remove(tokenHash);
        Connection c = Database.getConnection();
        if (c == null) {
            return;
        }
        try {
            PreparedStatement stmt = c.prepareStatement("delete from user_session where token_hash = ?;");
            try {
                stmt.setString(1, tokenHash);
                stmt.executeUpdate();
            } finally {
                stmt.close();
            }
        } catch (Exception e) {
            logger.error("Failed to delete a session.", e);
        } finally {
            Database.close(c);
        }
    }

    /** Drops sessions that have run out, in memory and in the database. */
    public static void removeExpiredSessions() {
        long now = System.currentTimeMillis();
        cache.values().removeIf(session -> session.isExpired(now));

        Connection c = Database.getConnection();
        if (c == null) {
            return;
        }
        try {
            PreparedStatement stmt = c.prepareStatement("delete from user_session where expires_at < ?;");
            try {
                stmt.setLong(1, now);
                int removed = stmt.executeUpdate();
                if (removed > 0) {
                    logger.info("Removed " + removed + " expired session(s).");
                }
            } finally {
                stmt.close();
            }
        } catch (Exception e) {
            logger.error("Failed to remove expired sessions.", e);
        } finally {
            Database.close(c);
        }
    }

    private static void persist(UserSession session) {
        Connection c = Database.getConnection();
        if (c == null) {
            // Better to hand out a session that only this process knows about than to
            // refuse the sign-in: the player can play now and signs in again after a
            // restart.
            logger.error("Could not store a session: no database connection. "
                    + "It will be forgotten when the server restarts.");
            return;
        }
        try {
            PreparedStatement stmt = c.prepareStatement("insert into user_session "
                    + "(token_hash, slack_user_id, slack_team_id, display_name, given_name, family_name, "
                    + "avatar_url, created_at, expires_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?);");
            try {
                stmt.setString(1, session.getTokenHash());
                stmt.setString(2, session.getSlackUserId());
                stmt.setString(3, session.getSlackTeamId());
                stmt.setString(4, session.getDisplayName());
                stmt.setString(5, session.getGivenName());
                stmt.setString(6, session.getFamilyName());
                stmt.setString(7, session.getAvatarUrl());
                stmt.setLong(8, session.getCreatedAt());
                stmt.setLong(9, session.getExpiresAt());
                stmt.executeUpdate();
            } finally {
                stmt.close();
            }
        } catch (Exception e) {
            logger.error("Failed to store a session.", e);
        } finally {
            Database.close(c);
        }
    }

    private static UserSession load(String tokenHash) {
        Connection c = Database.getConnection();
        if (c == null) {
            return null;
        }
        try {
            PreparedStatement stmt = c.prepareStatement("select slack_user_id, slack_team_id, display_name, "
                    + "given_name, family_name, avatar_url, created_at, expires_at "
                    + "from user_session where token_hash = ?;");
            try {
                stmt.setString(1, tokenHash);
                ResultSet rs = stmt.executeQuery();
                if (!rs.next()) {
                    return null;
                }
                return new UserSession(tokenHash, rs.getString("slack_user_id"), rs.getString("slack_team_id"),
                        rs.getString("display_name"), rs.getString("given_name"), rs.getString("family_name"),
                        rs.getString("avatar_url"), rs.getLong("created_at"), rs.getLong("expires_at"));
            } finally {
                stmt.close();
            }
        } catch (Exception e) {
            logger.error("Failed to read a session.", e);
            return null;
        } finally {
            Database.close(c);
        }
    }

    private static String hash(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(hashed.length * 2);
            for (byte b : hashed) {
                out.append(Character.forDigit((b >> 4) & 0xF, 16));
                out.append(Character.forDigit(b & 0xF, 16));
            }
            return out.toString();
        } catch (Exception e) {
            // SHA-256 is required of every JVM, so this cannot happen in practice.
            throw new IllegalStateException("SHA-256 is unavailable.", e);
        }
    }
}
