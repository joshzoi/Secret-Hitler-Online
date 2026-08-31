export const LIBERAL = "LIBERAL";
export const FASCIST = "FASCIST";
export const HITLER = "HITLER";

export enum PAGE {
  LOGIN = "login",
  LOBBY = "lobby",
  GAME = "game",
}

export const DEBUG = process.env.REACT_APP_DEBUG !== undefined;

// Set when the frontend is served from the same origin as the backend, i.e.
// behind a reverse proxy that forwards /check-login, /new-lobby, /ping and the
// /game websocket through to the Java server. The addresses are then read from
// window.location at runtime, so a single build works for any hostname.
const SAME_ORIGIN = process.env.REACT_APP_SAME_ORIGIN === "true";

export const SERVER_ADDRESS = SAME_ORIGIN
  ? window.location.host
  : process.env.REACT_APP_SERVER_ADDRESS || "secret-hitler-online.fly.dev";
export const SERVER_ADDRESS_HTTP = SAME_ORIGIN
  ? window.location.origin
  : process.env.REACT_APP_SERVER_ADDRESS_HTTP || "https://" + SERVER_ADDRESS;
export const WEBSOCKET_HEADER = SAME_ORIGIN
  ? window.location.protocol === "https:"
    ? "wss://"
    : "ws://"
  : process.env.REACT_APP_WEBSOCKET_HEADER || "wss://";

export const CHECK_LOGIN = "/check-login";
export const NEW_LOBBY = "/new-lobby";
export const WEBSOCKET = "/game";
export const SERVER_PING = "/ping";
export const LOBBY_CODE_LENGTH = 4;
export const SERVER_TIMEOUT = 4000;

//////// Reconnection

/* How often the client pings the server. Doubles as a liveness check and as the
   traffic that keeps the lobby from being reaped as inactive. */
export const PING_INTERVAL = 25000;
/* How long to wait for any reply before deciding the connection is dead. Only
   enforced while the page is visible: a hidden tab has its timers throttled, so a
   late reply there says nothing about the connection. */
export const PONG_TIMEOUT = 15000;
/* Coming back to a tab fires visibilitychange, focus and sometimes pageshow in
   quick succession. Only the first of them needs to check the connection. */
export const VERIFY_DEBOUNCE = 1000;
/* Backoff between reconnection attempts. The first retry is immediate, since the
   common case is a connection the server closed and will happily accept again. */
export const RECONNECT_BASE_DELAY = 500;
export const RECONNECT_MAX_DELAY = 5000;
/* How long to keep retrying before giving up and returning the player to the
   login page. Only counted while the page is visible, so a tab left in the
   background is still trying when the player comes back to it. */
export const RECONNECT_GIVE_UP_AFTER = 90000;

/* Websocket close reasons sent by the server, read from the text before the colon
   in the close reason. These mean reconnecting cannot succeed, so the player is
   told what happened instead of being left watching a spinner. */
export const CLOSE_LOBBY_NOT_FOUND = "lobby-not-found";
export const CLOSE_NAME_TAKEN = "name-taken";
export const CLOSE_LOBBY_FULL = "lobby-full";
export const CLOSE_GAME_IN_PROGRESS = "game-in-progress";
export const CLOSE_LOBBY_TIMED_OUT = "lobby-timed-out";
export const CLOSE_BAD_REQUEST = "bad-request";
/* This connection was superseded by a newer one from the same browser. Retrying
   would just have the two connections take turns evicting each other. */
export const CLOSE_REPLACED = "replaced";

//////// Game Constants
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

//////// JSON Packet Data

// Packet Headers
export const PARAM_PACKET_TYPE = "type";
export const PACKET_INVESTIGATION = "investigation";
export const PACKET_PEEK = "peek";
export const PACKET_GAME_STATE = "game";
export const PACKET_LOBBY = "lobby";
export const PACKET_OK = "ok";
export const PACKET_PONG = "pong";

// Commands
//<editor-fold desc="Commands">
export const PARAM_COMMAND = "command";
export const PARAM_NAME = "name";
export const PARAM_LOBBY = "lobby";
export const PARAM_ICON = "icon"; // id of the selected portrait.
export const PARAM_CLIENT_ID = "client-id"; // identifies this browser to the server.
export const PARAM_VOTE = "vote";
export const PARAM_VETO = "veto"; // the veto decision (yes/no)
export const PARAM_CHOICE = "choice"; // the index of the chosen policy.

export const COMMAND_PING = "ping";
export const COMMAND_SELECT_ICON = "select-icon";
export const COMMAND_START_GAME = "start-game";
export const COMMAND_GET_STATE = "get-state";
export const COMMAND_NOMINATE_CHANCELLOR = "nominate-chancellor";
export const COMMAND_REGISTER_VOTE = "register-vote";
export const COMMAND_REGISTER_PRESIDENT_CHOICE = "register-president-choice";
export const COMMAND_REGISTER_CHANCELLOR_CHOICE = "register-chancellor-choice";
export const COMMAND_REGISTER_CHANCELLOR_VETO = "chancellor-veto";
export const COMMAND_REGISTER_PRESIDENT_VETO = "president-veto";
export const COMMAND_REGISTER_EXECUTION = "register-execution";
export const COMMAND_REGISTER_SPECIAL_ELECTION = "register-special-election";
export const COMMAND_GET_INVESTIGATION = "get-investigation";
export const COMMAND_REGISTER_PEEK = "register-peek";
export const COMMAND_END_TERM = "end-term";
export const COMMAND_LEAVE_LOBBY = "leave-lobby";

//</editor-fold>

export const STATE_SETUP = "SETUP";
export const STATE_CHANCELLOR_NOMINATION = "CHANCELLOR_NOMINATION";
export const STATE_CHANCELLOR_VOTING = "CHANCELLOR_VOTING"; // Voting on the chancellor is taking place.
export const STATE_LEGISLATIVE_PRESIDENT = "LEGISLATIVE_PRESIDENT"; // In the legislative phase. The president is selecting a card to discard.
export const STATE_LEGISLATIVE_CHANCELLOR = "LEGISLATIVE_CHANCELLOR"; // In the legislative phase. The chancellor is selecting a card to enact.
export const STATE_LEGISLATIVE_PRESIDENT_VETO = "LEGISLATIVE_PRESIDENT_VETO"; // Chancellor decided to initiate veto, President chooses whether to allow.
export const STATE_PP_PEEK = "PRESIDENTIAL_POWER_PEEK"; // President may peek at the next three cards in the deck
export const STATE_PP_INVESTIGATE = "PRESIDENTIAL_POWER_INVESTIGATE"; // President can investigate a party membership
export const STATE_PP_EXECUTION = "PRESIDENTIAL_POWER_EXECUTION"; // President may choose a player to execute
export const STATE_PP_ELECTION = "PRESIDENTIAL_POWER_ELECTION"; // President chooses the next president, seat continues as normal after.
export const STATE_POST_LEGISLATIVE = "POST_LEGISLATIVE"; // Waiting for the President to end their turn.
export const STATE_LIBERAL_VICTORY_POLICY = "LIBERAL_VICTORY_POLICY"; // Liberal Party won through enacting Liberal policies.
export const STATE_LIBERAL_VICTORY_EXECUTION = "LIBERAL_VICTORY_EXECUTION"; // Liberal Party won through executing Hitler.
export const STATE_FASCIST_VICTORY_POLICY = "FASCIST_VICTORY_POLICY"; // Fascist Party won through enacting Fascist policies.
export const STATE_FASCIST_VICTORY_ELECTION = "FASCIST_VICTORY_ELECTION"; // Fascist Party won by successfully electing Hitler chancellor.

// Params
// <editor-fold desc="Params">

// Lobby
export const PARAM_USER_COUNT = "user-count";
export const PARAM_USERNAMES = "usernames";

// Peek
export const PARAM_PEEK = "peek";

// Investigation
export const PARAM_INVESTIGATION = "investigation";

// Incoming Data
export const PARAM_STATE = "state";
export const PARAM_LAST_STATE = "last-state";
export const PARAM_PLAYER_ORDER = "player-order";
export const PARAM_PLAYERS = "players";
export const PLAYER_IDENTITY = "id";
export const PLAYER_IS_ALIVE = "alive";
export const PLAYER_INVESTIGATED = "investigated";
export const PARAM_PRESIDENT = "president";
export const PARAM_CHANCELLOR = "chancellor";
export const PARAM_LAST_PRESIDENT = "last-president";
export const PARAM_LAST_CHANCELLOR = "last-chancellor";
export const PARAM_ELECTION_TRACKER = "election-tracker";
export const PARAM_ELEC_TRACKER_ADVANCED = "election-tracker-advanced";
export const PARAM_VOTES = "user-votes";
export const PARAM_LIBERAL_POLICIES = "liberal-policies";
export const PARAM_FASCIST_POLICIES = "fascist-policies";
export const PARAM_DRAW_DECK = "draw-size";
export const PARAM_DISCARD_DECK = "discard-size";
export const PARAM_PRESIDENT_CHOICES = "president-choices";
export const PARAM_CHANCELLOR_CHOICES = "chancellor-choices";
export const PARAM_TARGET = "target";
export const PARAM_LAST_POLICY = "last-policy";
export const PARAM_DID_VETO_OCCUR = "veto-occurred";
// </editor-fold>
