import { LOBBY_CODE_LENGTH } from "../constants";

/* Where a lobby code waits while the player is away at Slack. Signing in is a
   full navigation off the page and back, so anything held in memory is gone by
   the time they return. */
const PENDING_LOBBY_KEY = "secret-hitler-pending-lobby";

export type UrlParams = {
  /** A lobby code from an invite link. */
  lobby?: string;
  /** Why a sign-in did not work, if we have just come back from one. */
  authError?: string;
};

/**
 * Reads the parameters the app acts on once, then takes them out of the address
 * bar.
 *
 * Removing them matters: without it a refresh replays a spent sign-in error, and
 * an invite link keeps trying to rejoin a lobby the player has since left.
 */
export function consumeUrlParams(): UrlParams {
  const params = new URLSearchParams(window.location.search);
  const lobby = params.get("lobby");
  const authError = params.get("auth_error");

  if (lobby !== null || authError !== null) {
    params.delete("lobby");
    params.delete("auth_error");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname +
        (query ? "?" + query : "") +
        window.location.hash
    );
  }

  return {
    lobby: lobby
      ? lobby.toUpperCase().slice(0, LOBBY_CODE_LENGTH)
      : undefined,
    authError: authError ?? undefined,
  };
}

/** Remembers a lobby to join once the player has signed in. */
export function rememberPendingLobby(code: string): void {
  try {
    window.sessionStorage.setItem(PENDING_LOBBY_KEY, code);
  } catch (e) {
    // Private browsing, or storage turned off. The player can still type the code.
  }
}

/** Returns the remembered lobby, if any, and forgets it. */
export function takePendingLobby(): string | undefined {
  try {
    const stored = window.sessionStorage.getItem(PENDING_LOBBY_KEY);
    if (stored) {
      window.sessionStorage.removeItem(PENDING_LOBBY_KEY);
      return stored;
    }
  } catch (e) {
    // As above.
  }
  return undefined;
}
