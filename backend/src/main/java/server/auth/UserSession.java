package server.auth;

/**
 * A signed-in player: who Slack says they are, and how long we go on believing
 * it. Immutable; a new one is minted on each sign-in, which is what picks up a
 * changed display name or profile photo.
 */
public class UserSession {

    private final String tokenHash;
    private final String slackUserId;
    private final String slackTeamId;
    private final String displayName;
    private final String givenName;
    private final String familyName;
    private final String avatarUrl;
    private final long createdAt;
    private final long expiresAt;

    public UserSession(String tokenHash, String slackUserId, String slackTeamId, String displayName,
            String givenName, String familyName, String avatarUrl, long createdAt, long expiresAt) {
        this.tokenHash = tokenHash;
        this.slackUserId = slackUserId;
        this.slackTeamId = slackTeamId;
        this.displayName = displayName;
        this.givenName = givenName;
        this.familyName = familyName;
        this.avatarUrl = avatarUrl;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    /** Stable across sign-ins and name changes; what a seat is really owned by. */
    public String getSlackUserId() {
        return slackUserId;
    }

    public String getSlackTeamId() {
        return slackTeamId;
    }

    /** The name to show this player by, before any per-lobby disambiguation. */
    public String getDisplayName() {
        return displayName;
    }

    public String getGivenName() {
        return givenName;
    }

    public String getFamilyName() {
        return familyName;
    }

    /** Slack's hosted profile photo, or null if they have none. */
    public String getAvatarUrl() {
        return avatarUrl;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public long getExpiresAt() {
        return expiresAt;
    }

    /** The Slack profile this session was built from, for deriving a name. */
    public SlackProfile getProfile() {
        return new SlackProfile(slackUserId, slackTeamId, displayName, givenName, familyName, avatarUrl);
    }

    public boolean isExpired(long nowMillis) {
        return nowMillis >= expiresAt;
    }
}
