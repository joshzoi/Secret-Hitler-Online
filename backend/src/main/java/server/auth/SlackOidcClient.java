package server.auth;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import server.ApplicationConfig;

/**
 * Talks to Slack's OpenID Connect endpoints.
 *
 * Uses the JDK's own HTTP client so that signing in adds no dependency.
 *
 * We never parse the id_token, and so never verify its signature. That check
 * exists for flows where the token reaches us through the browser, which can
 * tamper with it. Here the identity comes from userInfo, which this server
 * fetches straight from slack.com over TLS, using an access token it got the
 * same way in exchange for a code sent to our registered redirect URI and
 * authenticated with our client secret. Both hops are back-channel, so TLS is
 * already doing the job a signature check would -- as OpenID Connect Core
 * section 3.1.3.7 allows.
 */
public class SlackOidcClient {

    private static Logger logger = LoggerFactory.getLogger(SlackOidcClient.class);

    private static final String AUTHORIZE_URL = "https://slack.com/openid/connect/authorize";
    private static final String TOKEN_URL = "https://slack.com/api/openid.connect.token";
    private static final String USER_INFO_URL = "https://slack.com/api/openid.connect.userInfo";
    private static final String SCOPES = "openid profile email";

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);

    /** Raised when Slack cannot or will not complete a sign-in. */
    public static class SlackException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public SlackException(String message) {
            super(message);
        }
    }

    /**
     * Builds the URL to send the player to so they can approve the sign-in.
     *
     * @param state a one-time value echoed back to us, tying the callback to this
     *              request.
     * @param nonce a one-time value Slack embeds in the id_token.
     */
    public static String buildAuthorizeUrl(String state, String nonce) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("response_type", "code");
        params.put("scope", SCOPES);
        params.put("client_id", ApplicationConfig.slackClientId());
        params.put("state", state);
        params.put("nonce", nonce);
        params.put("redirect_uri", ApplicationConfig.slackRedirectUri());
        // Sends them straight to the right workspace's sign-in. It is a convenience,
        // not a control: someone with several workspaces open can still come back
        // from a different one, which is why the callback checks the team itself.
        params.put("team", ApplicationConfig.slackTeamId());
        return AUTHORIZE_URL + "?" + formEncode(params);
    }

    /**
     * Exchanges an authorization code for an access token.
     *
     * @param code the code Slack sent to the callback.
     * @return the access token.
     * @throws SlackException if Slack refuses the exchange.
     */
    public static String exchangeCodeForToken(String code) {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("client_id", ApplicationConfig.slackClientId());
        form.put("client_secret", ApplicationConfig.slackClientSecret());
        form.put("code", code);
        form.put("grant_type", "authorization_code");
        // Slack compares this against the value sent to authorize, byte for byte.
        form.put("redirect_uri", ApplicationConfig.slackRedirectUri());

        JSONObject body = post(TOKEN_URL, formEncode(form));
        String accessToken = body.optString("access_token", "");
        if (accessToken.isEmpty()) {
            throw new SlackException("Slack returned no access token.");
        }
        return accessToken;
    }

    /**
     * Fetches the profile of the user an access token belongs to.
     *
     * @throws SlackException if Slack refuses, or sends back nothing usable.
     */
    public static SlackProfile fetchProfile(String accessToken) {
        JSONObject claims = get(USER_INFO_URL, accessToken);
        SlackProfile profile = SlackProfile.fromClaims(claims);
        if (profile == null) {
            throw new SlackException("Slack returned a profile with no user id.");
        }
        return profile;
    }

    private static JSONObject post(String url, String form) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(REQUEST_TIMEOUT)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8))
                .build();
        return send(request, url);
    }

    private static JSONObject get(String url, String accessToken) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(REQUEST_TIMEOUT)
                .header("Authorization", "Bearer " + accessToken)
                .GET()
                .build();
        return send(request, url);
    }

    private static JSONObject send(HttpRequest request, String url) {
        HttpResponse<String> response;
        try {
            response = HTTP.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new SlackException("Could not reach Slack (" + url + "): " + e.getMessage());
        }
        if (response.statusCode() != 200) {
            throw new SlackException("Slack answered " + response.statusCode() + " from " + url + ".");
        }

        JSONObject body;
        try {
            body = new JSONObject(response.body());
        } catch (Exception e) {
            throw new SlackException("Slack sent something that is not JSON from " + url + ".");
        }
        // Slack reports failure in the body with a 200 status, so the status code
        // alone would let an error through as if it had worked.
        if (!body.optBoolean("ok", false)) {
            String error = body.optString("error", "unknown");
            logger.warn("Slack refused a request to " + url + ": " + error);
            throw new SlackException("Slack refused the request: " + error);
        }
        return body;
    }

    private static String formEncode(Map<String, String> params) {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (out.length() > 0) {
                out.append('&');
            }
            out.append(encode(entry.getKey())).append('=').append(encode(entry.getValue()));
        }
        return out.toString();
    }

    private static String encode(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8.name());
        } catch (UnsupportedEncodingException e) {
            // UTF-8 is always available.
            throw new IllegalStateException(e);
        }
    }
}
