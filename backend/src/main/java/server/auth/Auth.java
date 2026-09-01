package server.auth;

import io.javalin.http.Context;
import io.javalin.websocket.WsContext;

/**
 * Finds the session behind a request.
 *
 * Both an ordinary request and a websocket handshake carry cookies, so one
 * cookie authenticates both and no token ever appears in a URL -- where it would
 * end up in access logs, browser history and Referer headers.
 */
public class Auth {

    /** @return the caller's session, or null if they are not signed in. */
    public static UserSession lookup(Context ctx) {
        return SessionStore.lookup(ctx.cookie(AuthRoutes.SESSION_COOKIE));
    }

    /**
     * The same, for the request that opens a websocket. Javalin exposes the
     * handshake's cookies on the websocket context.
     *
     * @return the connecting player's session, or null if they are not signed in.
     */
    public static UserSession lookup(WsContext ctx) {
        return SessionStore.lookup(ctx.cookie(AuthRoutes.SESSION_COOKIE));
    }
}
