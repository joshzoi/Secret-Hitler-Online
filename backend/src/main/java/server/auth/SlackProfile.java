package server.auth;

import org.json.JSONObject;

/**
 * What Slack tells us about a signed-in user, pulled out of the claims returned
 * by openid.connect.userInfo.
 *
 * The Slack-specific claims are namespaced with a URL, hence the awkward keys.
 */
public class SlackProfile {

    private static final String CLAIM_USER_ID = "https://slack.com/user_id";
    private static final String CLAIM_TEAM_ID = "https://slack.com/team_id";
    /* 192px matches the size a player card renders at, so it is sharp on a retina
       screen without shipping the 512px version to everyone in the lobby. */
    private static final String CLAIM_IMAGE = "https://slack.com/user_image_192";

    private final String userId;
    private final String teamId;
    private final String displayName;
    private final String givenName;
    private final String familyName;
    private final String avatarUrl;

    public SlackProfile(String userId, String teamId, String displayName, String givenName,
            String familyName, String avatarUrl) {
        this.userId = userId;
        this.teamId = teamId;
        this.displayName = displayName;
        this.givenName = givenName;
        this.familyName = familyName;
        this.avatarUrl = avatarUrl;
    }

    /**
     * Reads a profile out of a userInfo response.
     *
     * @param claims the parsed response body.
     * @return the profile, or null if it carries no user id to identify them by.
     */
    public static SlackProfile fromClaims(JSONObject claims) {
        String userId = optString(claims, CLAIM_USER_ID);
        if (userId == null) {
            // "sub" is the same value in Slack's implementation; fall back to it
            // rather than refusing a sign-in over a claim name.
            userId = optString(claims, "sub");
        }
        if (userId == null) {
            return null;
        }

        String avatar = optString(claims, CLAIM_IMAGE);
        if (avatar == null) {
            avatar = optString(claims, "picture");
        }

        return new SlackProfile(userId, optString(claims, CLAIM_TEAM_ID), optString(claims, "name"),
                optString(claims, "given_name"), optString(claims, "family_name"), avatar);
    }

    /** Treats absent and blank alike, since Slack sends "" for unset fields. */
    private static String optString(JSONObject source, String key) {
        if (!source.has(key) || source.isNull(key)) {
            return null;
        }
        String value = source.optString(key, "").trim();
        return value.isEmpty() ? null : value;
    }

    public String getUserId() {
        return userId;
    }

    public String getTeamId() {
        return teamId;
    }

    /** Their full name, e.g. "Joshua Favetti". */
    public String getDisplayName() {
        return displayName;
    }

    public String getGivenName() {
        return givenName;
    }

    public String getFamilyName() {
        return familyName;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }
}
