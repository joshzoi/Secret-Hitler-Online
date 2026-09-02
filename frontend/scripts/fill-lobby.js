#!/usr/bin/env node
/**
 * Fills a lobby with placeholder players, for testing a full game locally.
 *
 * The game needs five people and there are no bots on the server any more, so
 * seeing a real game through by hand means five browser sessions. This opens the
 * rest of them: each placeholder is an ordinary websocket client that joins like
 * anyone else and plays the first legal move it is offered. It is not an AI and
 * is not trying to play well -- it exists so the state machine keeps moving.
 *
 * Deliberately a separate process rather than something the server can do. The
 * server has no notion of a player it controls, and giving it one would put the
 * machinery for fake players back into Lobby for the sake of development.
 *
 * Each one signs in through /auth/dev-login, which the server only offers when
 * DEBUG_MODE is set, so this cannot be pointed at a real deployment.
 *
 * Start the lobby in a browser, then:
 *
 *     cd frontend
 *     npm run fillLobby -- ABCD          # four placeholders, joining lobby ABCD
 *     npm run fillLobby -- ABCD 2        # just two
 *     npm run fillLobby -- ABCD 4 --server ws://localhost:8080
 *
 * Press START GAME in the browser once they have joined. Ctrl-C makes them leave.
 */

const http = require("http");
const https = require("https");

/* The `ws` package rather than Node's built-in WebSocket: the session arrives in
   a cookie, and only this one lets a handshake carry headers. */
const WebSocketImpl = require("ws");

/* 127.0.0.1 rather than localhost: the backend binds IPv4, and localhost
   resolves to ::1 first in some environments, which just refuses. */
const DEFAULT_SERVER = "ws://127.0.0.1:4040";
const DEFAULT_COUNT = 4;
/* Long enough to watch what is happening, short enough not to be tedious. */
const ACTION_DELAY_MS = 400;
/* Staggered joins keep the lobby order stable and avoid a scramble for icons. */
const JOIN_STAGGER_MS = 250;
const PING_INTERVAL_MS = 25000;

/** The http origin matching the websocket address, for signing in. */
function httpOrigin(wsServer) {
  return wsServer.replace(/^ws/, "http");
}

/**
 * Signs a placeholder in and returns the cookie the server hands back.
 *
 * Uses the development-only sign-in route, so no Slack round trip is needed --
 * which is just as well, since Slack will not redirect to a localhost address.
 */
function devLogin(origin, name) {
  return new Promise((resolve, reject) => {
    const url = new URL(origin + "/auth/dev-login?name=" + encodeURIComponent(name));
    const client = url.protocol === "https:" ? https : http;
    const request = client.request(url, { method: "GET" }, (response) => {
      response.resume(); // discard the body; we only want the cookie
      const cookies = response.headers["set-cookie"];
      if (response.statusCode !== 200 || !cookies) {
        reject(
          new Error(
            "dev-login failed with status " + response.statusCode +
              ". Is the server running with DEBUG_MODE set?"
          )
        );
        return;
      }
      // Just the name=value part; the attributes are for a browser to act on.
      resolve(cookies.map((cookie) => cookie.split(";")[0]).join("; "));
    });
    request.on("error", reject);
    request.end();
  });
}

function usage(message) {
  if (message) console.error("fill-lobby: " + message + "\n");
  console.error(
    "usage: node scripts/fill-lobby.js <LOBBY> [count] [--server ws://host:port]"
  );
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const positional = [];
  let server = DEFAULT_SERVER;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--help" || argv[i] === "-h") usage();
    else if (argv[i] === "--server") server = argv[++i];
    else if (argv[i].startsWith("--")) usage("unknown option " + argv[i]);
    else positional.push(argv[i]);
  }
  if (positional.length === 0) usage("a lobby code is required");
  const count = positional[1] === undefined ? DEFAULT_COUNT : Number(positional[1]);
  if (!Number.isInteger(count) || count < 1) usage("count must be a positive integer");
  if (!server) usage("--server needs a value");
  return { lobby: positional[0].toUpperCase(), count, server };
}

const { lobby, count, server } = parseArgs(process.argv.slice(2));

/** Everyone still alive, in seating order. */
function livingPlayers(state) {
  return state.playerOrder.filter((p) => state.players[p] && state.players[p].alive);
}

/**
 * The first player this president is allowed to nominate: alive, not themselves,
 * not the outgoing chancellor, and not the outgoing president unless the table
 * has shrunk to five, when that restriction lifts.
 */
function eligibleChancellor(state, me) {
  const living = livingPlayers(state);
  return living.find(
    (p) =>
      p !== me &&
      p !== state.lastChancellor &&
      !(p === state.lastPresident && living.length > 5)
  );
}

function firstOtherAlive(state, me) {
  return livingPlayers(state).find((p) => p !== me);
}

function firstUninvestigated(state, me) {
  return livingPlayers(state).find(
    (p) => p !== me && !(state.players[p] && state.players[p].investigated)
  );
}

/**
 * What this player owes the game right now, or null if it is someone else's move.
 * Always the first legal option -- Ja, the first policy, the first valid target.
 */
function decideAction(state, me) {
  const isPresident = state.president === me;
  const isChancellor = state.chancellor === me;
  const self = state.players[me];
  const alive = Boolean(self && self.alive);

  switch (state.state) {
    case "CHANCELLOR_NOMINATION": {
      if (!isPresident) return null;
      const target = eligibleChancellor(state, me);
      return target ? { command: "nominate-chancellor", target } : null;
    }
    case "CHANCELLOR_VOTING":
      if (!alive) return null;
      // The vote is already in; the packet is just someone else voting.
      if (state.userVotes && state.userVotes[me] !== undefined) return null;
      return { command: "register-vote", vote: true };
    case "LEGISLATIVE_PRESIDENT":
      return isPresident ? { command: "register-president-choice", choice: 0 } : null;
    case "LEGISLATIVE_CHANCELLOR":
      return isChancellor ? { command: "register-chancellor-choice", choice: 0 } : null;
    case "LEGISLATIVE_PRESIDENT_VETO":
      // Refuse the veto, so the turn resolves instead of looping.
      return isPresident ? { command: "president-veto", veto: false } : null;
    case "PRESIDENTIAL_POWER_PEEK":
      return isPresident ? { command: "register-peek" } : null;
    case "PRESIDENTIAL_POWER_INVESTIGATE": {
      if (!isPresident) return null;
      const target = firstUninvestigated(state, me);
      return target ? { command: "get-investigation", target } : null;
    }
    case "PRESIDENTIAL_POWER_EXECUTION": {
      if (!isPresident) return null;
      const target = firstOtherAlive(state, me);
      return target ? { command: "register-execution", target } : null;
    }
    case "PRESIDENTIAL_POWER_ELECTION": {
      if (!isPresident) return null;
      const target = firstOtherAlive(state, me);
      return target ? { command: "register-special-election", target } : null;
    }
    case "POST_LEGISLATIVE":
      // The server ends the term itself; there is nothing to send.
      return null;
    default:
      // Setup, and the four victory states: nothing left to do.
      return null;
  }
}

/**
 * Identifies the position the game is in, so a placeholder acts once per turn
 * rather than every time a packet arrives. Votes by others re-broadcast the same
 * position, and acting on those again would be rejected as an illegal move.
 */
function positionKey(state) {
  return [
    state.state,
    state.president,
    state.chancellor,
    state.liberalPolicies,
    state.fascistPolicies,
    state.electionTracker,
    state.drawSize,
  ].join("|");
}

function connect(requestedName, cookie) {
  // Only the lobby: the server takes who we are from the session in the cookie.
  const url = server + "/game?lobby=" + encodeURIComponent(lobby);

  const socket = new WebSocketImpl(url, { headers: { Cookie: cookie } });
  let requestId = 0;
  let actedOn = null;
  let pingTimer;
  /* What this lobby decided to call us. The server picks names, and disambiguates
     them, so it need not be the one we asked to sign in as. */
  let name = requestedName;

  function send(payload) {
    socket.send(
      JSON.stringify(Object.assign({ lobby, "request-id": requestId++ }, payload))
    );
  }

  socket.onopen = () => {
    console.log(name + ": joined " + lobby);
    pingTimer = setInterval(() => send({ command: "ping" }), PING_INTERVAL_MS);
  };

  socket.onmessage = (event) => {
    const packet = JSON.parse(String(event.data));
    switch (packet.type) {
      case "lobby": {
        if (packet.you && packet.you !== name) {
          console.log(requestedName + ": joined as " + packet.you);
          name = packet.you;
        }
        break;
      }
      case "game": {
        if (packet.you) {
          name = packet.you;
        }
        const key = positionKey(packet);
        if (key === actedOn) return;
        const action = decideAction(packet, name);
        if (!action) return;
        actedOn = key;
        setTimeout(() => {
          if (socket.readyState !== 1) return; // OPEN
          console.log(name + ": " + action.command + (action.target ? " -> " + action.target : ""));
          send(action);
        }, ACTION_DELAY_MS);
        break;
      }
      case "error":
        console.error(name + ": refused -- " + packet.message);
        break;
      default:
      // ok, pong and investigation results need no reply.
    }
  };

  socket.onclose = (event) => {
    clearInterval(pingTimer);
    const reason = event && event.reason ? " (" + event.reason + ")" : "";
    console.log(name + ": disconnected" + reason);
  };

  socket.onerror = (event) => {
    console.error(name + ": connection error", event && event.message ? event.message : "");
  };

  return { socket, send };
}

const players = [];

async function start() {
  console.log(
    "Filling " + lobby + " with " + count + " placeholder player" +
      (count === 1 ? "" : "s") + " via " + server + ". Ctrl-C to remove them."
  );
  const origin = httpOrigin(server);
  for (let i = 0; i < count; i++) {
    const name = "Test " + (i + 1);
    try {
      const cookie = await devLogin(origin, name);
      players.push(connect(name, cookie));
    } catch (e) {
      console.error(name + ": could not sign in -- " + e.message);
      process.exit(1);
    }
    // Staggered so the lobby fills in a predictable order.
    await new Promise((resolve) => setTimeout(resolve, JOIN_STAGGER_MS));
  }
}

start();

process.on("SIGINT", () => {
  // Leave properly, so the seats are freed rather than held open for a reconnect
  // that is not coming -- otherwise the next game waits out the grace period.
  players.forEach(({ socket, send }) => {
    try {
      if (socket.readyState === 1) send({ command: "leave-lobby" });
      socket.close();
    } catch (e) {
      /* already gone */
    }
  });
  setTimeout(() => process.exit(0), 200);
});
