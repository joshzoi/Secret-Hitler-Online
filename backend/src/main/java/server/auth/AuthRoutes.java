package server.auth;

import io.javalin.Javalin;
import io.javalin.http.Context;
import io.javalin.http.Cookie;
import io.javalin.http.SameSite;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import server.ApplicationConfig;

/**
 * Signing in with Slack.
 *
 * The player is sent to Slack, approves the app, and comes back to the callback
 * with a code. We swap that for their profile, check they are in the workspace
 * this deployment belongs to, and give their browser a session cookie.
 */
public class AuthRoutes {

    private static Logger logger = LoggerFactory.getLogger(AuthRoutes.class);

    public static final String SESSION_COOKIE = "sh_session";
    private static final String STATE_COOKIE = "sh_oauth_state";
    private static final int STATE_COOKIE_MAX_AGE_SECONDS = 10 * 60;

    /* Reasons the sign-in did not work, passed back to the page as ?auth_error= so
       it can explain itself. Never Slack's own wording, which is for developers. */
    private static final String ERROR_DENIED = "denied";
    private static final String ERROR_EXPIRED = "expired";
    private static final String ERROR_WRONG_WORKSPACE = "wrong_workspace";
    private static final String ERROR_SLACK = "slack";
    private static final String ERROR_BAD_REQUEST = "bad_request";
    private static final String ERROR_NOT_CONFIGURED = "not_configured";

    public static void register(Javalin app) {
        app.get("/auth/slack/login", AuthRoutes::login);
        app.get(ApplicationConfig.SLACK_CALLBACK_PATH, AuthRoutes::callback);
        app.get("/auth/me", AuthRoutes::me);
        app.post("/auth/logout", AuthRoutes::logout);

        if (ApplicationConfig.DEBUG) {
            // Registered only in development, so that a misconfigured deployment
            // cannot expose it and a scanner cannot find it. Slack refuses to
            // redirect back to a plain http address, so without this there is no way
            // to sign in on localhost at all.
            app.get("/auth/dev-login", AuthRoutes::devLogin);
            app.post("/auth/dev-login", AuthRoutes::devLogin);
        }
    }

    /** Sends the player to Slack to approve the sign-in. */
    private static void login(Context ctx) {
        if (!ApplicationConfig.isSlackConfigured()) {
            logger.error("A player tried to sign in, but Slack is not configured on this server.");
            ctx.redirect("/?auth_error=" + ERROR_NOT_CONFIGURED);
            return;
        }

        String nonce = PendingAuthStore.randomToken();
        String returnTo = safeReturnPath(ctx.queryParam("redirect"));
        String state = PendingAuthStore.start(nonce, returnTo);

        // Also in a cookie, so the callback has to reach the browser that started
        // this. Lax rather than Strict: the callback arrives as a top-level
        // navigation from slack.com, and Strict would withhold the cookie on exactly
        // that request, making every sign-in look like it had expired.
        Cookie stateCookie = new Cookie(STATE_COOKIE, state, "/", STATE_COOKIE_MAX_AGE_SECONDS,
                ApplicationConfig.cookieSecure(), 0, true, null, null, SameSite.LAX);
        ctx.cookie(stateCookie);

        ctx.redirect(SlackOidcClient.buildAuthorizeUrl(state, nonce));
    }

    /** Where Slack returns the player once they have approved (or refused). */
    private static void callback(Context ctx) {
        String state = ctx.queryParam("state");
        String stateCookie = ctx.cookie(STATE_COOKIE);
        clearStateCookie(ctx);

        if (ctx.queryParam("error") != null) {
            // Most often they pressed Cancel.
            ctx.redirect("/?auth_error=" + ERROR_DENIED);
            return;
        }

        String code = ctx.queryParam("code");
        if (code == null || code.isEmpty() || state == null || state.isEmpty()) {
            ctx.redirect("/?auth_error=" + ERROR_BAD_REQUEST);
            return;
        }
        if (stateCookie == null || !stateCookie.equals(state)) {
            logger.warn("A sign-in came back with a state that does not match the browser's cookie.");
            ctx.redirect("/?auth_error=" + ERROR_EXPIRED);
            return;
        }

        PendingAuthStore.PendingAuth pending = PendingAuthStore.take(state);
        if (pending == null) {
            // Unknown, already used, or older than the ten minute window.
            ctx.redirect("/?auth_error=" + ERROR_EXPIRED);
            return;
        }

        SlackProfile profile;
        try {
            profile = SlackOidcClient.fetchProfile(SlackOidcClient.exchangeCodeForToken(code));
        } catch (SlackOidcClient.SlackException e) {
            logger.warn("Could not complete a Slack sign-in: " + e.getMessage());
            ctx.redirect("/?auth_error=" + ERROR_SLACK);
            return;
        }

        // The team parameter on the authorize URL only chooses which workspace Slack
        // offers first. This is the check that actually keeps other workspaces out.
        String allowedTeam = ApplicationConfig.slackTeamId();
        if (allowedTeam != null && !allowedTeam.equals(profile.getTeamId())) {
            logger.warn("Refused a sign-in from workspace " + profile.getTeamId()
                    + "; this server only allows " + allowedTeam + ".");
            ctx.redirect("/?auth_error=" + ERROR_WRONG_WORKSPACE);
            return;
        }

        issueSession(ctx, profile);
        logger.info("Signed in " + profile.getDisplayName() + " (" + profile.getUserId() + ").");
        ctx.redirect(pending.returnTo);
    }

    /** Who the caller is, for the page to show and to know it is signed in. */
    private static void me(Context ctx) {
        UserSession session = Auth.lookup(ctx);
        if (session == null) {
            ctx.status(401);
            ctx.contentType("application/json");
            ctx.result(new JSONObject().put("signedIn", false).toString());
            return;
        }
        ctx.contentType("application/json");
        ctx.result(describe(session).toString());
    }

    private static void logout(Context ctx) {
        String token = ctx.cookie(SESSION_COOKIE);
        if (token != null) {
            SessionStore.revoke(token);
        }
        // Overwrite rather than remove, so the browser is told to drop it even if the
        // attributes it was set with do not match a plain removal.
        Cookie cleared = new Cookie(SESSION_COOKIE, "", "/", 0,
                ApplicationConfig.cookieSecure(), 0, true, null, null, SameSite.LAX);
        ctx.cookie(cleared);
        ctx.status(200);
        ctx.result("OK");
    }

    /**
     * Signs in as anybody, without Slack. Development only, and only registered
     * when DEBUG_MODE is set.
     *
     * A game needs five people, and one browser now holds one seat, so testing means
     * several separate sessions. Accepting GET is what makes that bearable: the URL
     * can be opened in a second browser profile.
     */
    private static void devLogin(Context ctx) {
        String name = ctx.queryParam("name");
        if (name == null || name.trim().isEmpty()) {
            name = "Tester";
        }
        name = name.trim();

        // Same name means the same person, so a reconnect finds their seat again.
        String id = ctx.queryParam("id");
        if (id == null || id.trim().isEmpty()) {
            id = "U_DEV_" + name.toLowerCase().replaceAll("[^a-z0-9]", "");
        }

        String given = name;
        String family = ctx.queryParam("family");
        int space = name.indexOf(' ');
        if (space > 0) {
            given = name.substring(0, space);
            if (family == null) {
                family = name.substring(space + 1);
            }
        }

        String team = ApplicationConfig.slackTeamId();
        // No avatar unless one is asked for, so the default exercises the same
        // fallback a real Slack user with no profile photo gets, and development
        // keeps working offline. Pass ?avatar=<url> to check how a photo renders.
        String avatar = ctx.queryParam("avatar");
        if (avatar != null && avatar.trim().isEmpty()) {
            avatar = null;
        }
        SlackProfile profile = new SlackProfile(id.trim(), team == null ? "T_DEV" : team,
                name, given, family, avatar);

        UserSession session = issueSession(ctx, profile);
        logger.warn("DEV LOGIN issued for '" + name + "' (" + id + ").");
        ctx.contentType("application/json");
        ctx.result(describe(session).toString());
    }

    private static UserSession issueSession(Context ctx, SlackProfile profile) {
        SessionStore.IssuedSession issued = SessionStore.create(profile);
        Cookie cookie = new Cookie(SESSION_COOKIE, issued.token, "/",
                (int) ApplicationConfig.sessionTtlSeconds(),
                // Secure would stop a development browser storing it over plain http.
                ApplicationConfig.cookieSecure(),
                0,
                // The page never needs to read this, and HttpOnly puts it out of reach
                // of any script that finds its way onto it.
                true,
                null, null,
                // Lax also means a link followed from Slack itself arrives signed in,
                // which is how people will actually open this.
                SameSite.LAX);
        ctx.cookie(cookie);
        return issued.session;
    }

    private static JSONObject describe(UserSession session) {
        JSONObject out = new JSONObject();
        out.put("signedIn", true);
        out.put("name", session.getDisplayName());
        out.put("slackUserId", session.getSlackUserId());
        // JSONObject.put drops a key whose value is null, so an absent avatar simply
        // does not appear rather than arriving as the string "null".
        out.put("avatar", session.getAvatarUrl());
        return out;
    }

    private static void clearStateCookie(Context ctx) {
        Cookie cleared = new Cookie(STATE_COOKIE, "", "/", 0,
                ApplicationConfig.cookieSecure(), 0, true, null, null, SameSite.LAX);
        ctx.cookie(cleared);
    }

    /**
     * Restricts where a sign-in may send the player back to.
     *
     * Anything but a path on this site is discarded. Without that, the address to
     * return to is an open redirect: a link to our own sign-in that lands the player
     * somewhere else entirely, having just proved they trust us.
     */
    private static String safeReturnPath(String requested) {
        if (requested == null || requested.isEmpty()) {
            return "/";
        }
        // "//evil.example" is a protocol-relative URL, and a colon means a scheme.
        if (!requested.startsWith("/") || requested.startsWith("//") || requested.contains(":")) {
            return "/";
        }
        if (requested.contains("\\") || requested.contains("\n") || requested.contains("\r")) {
            return "/";
        }
        return requested;
    }
}
