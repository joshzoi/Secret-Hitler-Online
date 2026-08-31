/**
 * A stable identifier for this browser tab, used so the server can recognise a
 * player who drops and comes back as the same person and hand them their seat
 * back, rather than seeing an unrelated stranger asking for a name that is
 * already taken.
 *
 * It is kept in sessionStorage rather than localStorage on purpose: sessionStorage
 * survives a reload, a tab being restored, and the page being suspended while the
 * player looks at something else, but it is not shared between tabs. Two tabs on
 * one machine stay two separate players.
 */

const CLIENT_ID_KEY = "secret-hitler-client-id";

/* Used when sessionStorage is unavailable (Safari private browsing, storage
   disabled). Lasts only as long as the page, which is still enough to survive the
   disconnects that happen while the page stays loaded. */
let fallbackClientId: string | undefined = undefined;

/**
 * Generates a random identifier.
 * crypto.randomUUID is only available in secure contexts, so a self-hosted
 * instance served over plain http needs the fallback.
 */
function generateClientId(): string {
  const cryptoApi: Crypto | undefined = window.crypto;
  if (cryptoApi && typeof (cryptoApi as any).randomUUID === "function") {
    return (cryptoApi as any).randomUUID();
  }
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    let id = "";
    for (let i = 0; i < bytes.length; i++) {
      id += ("0" + bytes[i].toString(16)).slice(-2);
    }
    return id;
  }
  return (
    Date.now().toString(16) + "-" + Math.random().toString(16).substring(2, 18)
  );
}

/**
 * Returns this tab's client id, creating and storing one on first use.
 */
export function getClientId(): string {
  try {
    const stored = window.sessionStorage.getItem(CLIENT_ID_KEY);
    if (stored) {
      return stored;
    }
    const created = generateClientId();
    window.sessionStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch (e) {
    if (fallbackClientId === undefined) {
      fallbackClientId = generateClientId();
    }
    return fallbackClientId;
  }
}
