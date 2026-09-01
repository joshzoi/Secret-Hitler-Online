/**
 * Serves the backend through the development server, so that the whole app is on
 * one origin in development just as it is in production behind nginx.
 *
 * Signing in puts a session in a cookie, and the websocket handshake has to carry
 * it. There is no way to ask a WebSocket to send credentials the way fetch can,
 * so the connection has to be same-origin -- which also means no CORS, and no
 * `credentials` on every call.
 *
 * Reachable from wherever the dev server runs: localhost when it is on this
 * machine, the compose service name when it is in a container.
 */
const { createProxyMiddleware } = require("http-proxy-middleware");

const target = process.env.BACKEND_ORIGIN || "http://127.0.0.1:4040";

module.exports = function (app) {
  const common = {
    target,
    // Keep the browser's Host, so the backend sees the address the player is
    // actually using rather than the one we forwarded to.
    changeOrigin: false,
    xfwd: true,
    logLevel: "warn",
  };

  app.use(
    createProxyMiddleware(
      ["/auth", "/check-login", "/new-lobby", "/open-lobbies", "/ping"],
      common
    )
  );
  app.use(createProxyMiddleware("/game", { ...common, ws: true }));
};
