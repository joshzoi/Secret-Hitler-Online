import {
  AUTH_LOGOUT,
  AUTH_ME,
  CHECK_LOGIN,
  NEW_LOBBY,
  OPEN_LOBBIES,
  SERVER_ADDRESS_HTTP,
} from "../constants";
import { OpenLobby, SessionUser } from "../types/auth";

/**
 * Thrown when the server says we are not signed in. Every caller treats this the
 * same way -- stop, and send the player back to the sign-in screen -- so the
 * decision lives here rather than at each call site.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super("Not signed in.");
    // Extending a built-in breaks instanceof without this when targeting ES5,
    // which is what react-scripts compiles to.
    Object.setPrototypeOf(this, SessionExpiredError.prototype);
  }
}

/**
 * Calls the backend, turning a 401 into a SessionExpiredError.
 *
 * Same-origin in development (through setupProxy.js) and in production (through
 * nginx), so the session cookie is sent without asking. Saying so explicitly
 * documents that, and is the one line to change if the two are ever split.
 */
export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(SERVER_ADDRESS_HTTP + path, {
    ...init,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
  });
  if (response.status === 401) {
    throw new SessionExpiredError();
  }
  return response;
}

/** The signed-in player, or null if nobody is signed in. */
export async function getSession(
  signal?: AbortSignal
): Promise<SessionUser | null> {
  try {
    const response = await apiFetch(AUTH_ME, { signal });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as SessionUser;
  } catch (e) {
    if (e instanceof SessionExpiredError) {
      return null;
    }
    throw e;
  }
}

export async function signOut(): Promise<void> {
  try {
    await apiFetch(AUTH_LOGOUT, { method: "POST" });
  } catch (e) {
    // Already signed out as far as the server is concerned, which is where we
    // were trying to get to.
  }
}

export async function listOpenLobbies(
  signal?: AbortSignal
): Promise<OpenLobby[]> {
  const response = await apiFetch(OPEN_LOBBIES, { signal });
  if (!response.ok) {
    throw new Error("Could not load the list of games.");
  }
  const body = await response.json();
  return (body.lobbies ?? []) as OpenLobby[];
}

/** Creates a lobby and returns its code. */
export async function createLobby(): Promise<string> {
  const response = await apiFetch(NEW_LOBBY, { method: "POST" });
  if (!response.ok) {
    throw new Error("Could not create a lobby.");
  }
  return (await response.text()).trim();
}

/** Asks whether this player could join a lobby, before opening a socket to it. */
export function checkLogin(lobby: string): Promise<Response> {
  return apiFetch(CHECK_LOGIN + "?lobby=" + encodeURIComponent(lobby));
}
