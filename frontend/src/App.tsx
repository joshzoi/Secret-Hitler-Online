import React, { Component } from "react";
import ReactGA from "react-ga";
import "./App.css";
import "./Lobby.css";
import "./fonts.css";
import MaxLengthTextField from "./util/MaxLengthTextField";
import CustomAlert from "./custom-alert/CustomAlert";
import RoleAlert from "./custom-alert/RoleAlert";
import EventBar from "./event-bar/EventBar";

// TODO: replace constants with enums from types
import {
  PAGE,
  SERVER_ADDRESS_HTTP,
  NEW_LOBBY,
  CHECK_LOGIN,
  SERVER_ADDRESS,
  WEBSOCKET,
  PARAM_USERNAMES,
  LOBBY_CODE_LENGTH,
  PARAM_STATE,
  STATE_CHANCELLOR_NOMINATION,
  STATE_CHANCELLOR_VOTING,
  PARAM_PRESIDENT,
  STATE_LEGISLATIVE_PRESIDENT,
  STATE_LEGISLATIVE_CHANCELLOR,
  PARAM_PACKET_TYPE,
  PACKET_LOBBY,
  PACKET_GAME_STATE,
  PACKET_INVESTIGATION,
  PACKET_OK,
  STATE_SETUP,
  STATE_POST_LEGISLATIVE,
  STATE_LEGISLATIVE_PRESIDENT_VETO,
  STATE_PP_INVESTIGATE,
  STATE_PP_EXECUTION,
  STATE_PP_ELECTION,
  STATE_PP_PEEK,
  PLAYER_IS_ALIVE,
  PARAM_TARGET,
  STATE_FASCIST_VICTORY_ELECTION,
  STATE_FASCIST_VICTORY_POLICY,
  STATE_LIBERAL_VICTORY_EXECUTION,
  STATE_LIBERAL_VICTORY_POLICY,
  WEBSOCKET_HEADER,
  DEBUG,
  PACKET_PONG,
  PING_INTERVAL,
  PONG_TIMEOUT,
  VERIFY_DEBOUNCE,
  RECONNECT_BASE_DELAY,
  RECONNECT_MAX_DELAY,
  RECONNECT_GIVE_UP_AFTER,
  CLOSE_LOBBY_NOT_FOUND,
  CLOSE_NAME_TAKEN,
  CLOSE_LOBBY_FULL,
  CLOSE_GAME_IN_PROGRESS,
  CLOSE_LOBBY_TIMED_OUT,
  CLOSE_BAD_REQUEST,
  CLOSE_REPLACED,
  PARAM_CLIENT_ID,
  SERVER_PING,
  PARAM_ICON,
  PARAM_INVESTIGATION,
} from "./constants";

import PlayerDisplay, {
  DISABLE_EXECUTED_PLAYERS,
  DISABLE_NONE,
} from "./player/PlayerDisplay";
import StatusBar from "./status-bar/StatusBar";
import Board from "./board/Board";
import VotingPrompt from "./custom-alert/VotingPrompt";
import PresidentLegislativePrompt from "./custom-alert/PresidentLegislativePrompt";
import ChancellorLegislativePrompt from "./custom-alert/ChancellorLegislativePrompt";
import VetoPrompt from "./custom-alert/VetoPrompt";
import ElectionTrackerAlert from "./custom-alert/ElectionTrackerAlert";
import PolicyEnactedAlert from "./custom-alert/PolicyEnactedAlert";
import {
  SelectExecutionPrompt,
  SelectInvestigationPrompt,
  SelectNominationPrompt,
  SelectSpecialElectionPrompt,
} from "./custom-alert/SelectPlayerPrompt";
import ButtonPrompt from "./custom-alert/ButtonPrompt";
import PeekPrompt from "./custom-alert/PeekPrompt";
import InvestigationAlert from "./custom-alert/InvestigationAlert";
import Deck from "./board/Deck";
import PlayerPolicyStatus from "./util/PlayerPolicyStatus";

import VictoryFascistHeader from "./assets/victory-fascist-header.png";
import VictoryLiberalHeader from "./assets/victory-liberal-header.png";
import IconSelection from "./custom-alert/IconSelection";
import HelmetMetaData from "./util/HelmetMetaData";
import { defaultPortrait } from "./assets";
import Player from "./player/Player";
import LoginPageContent from "./LoginPageContent";
import Cookies from "js-cookie";
import { RoleVisibilityContext } from "./util/RoleVisibilityContext";
import { getClientId } from "./util/clientId";
import {
  GameState,
  LobbyState,
  Role,
  ServerRequestPayload,
  WSCommand,
  WSCommandType,
} from "./types";

const EVENT_BAR_FADE_OUT_DURATION = 500;
const CUSTOM_ALERT_FADE_DURATION = 1000;

const DEFAULT_GAME_STATE: GameState = {
  liberalPolicies: 0,
  fascistPolicies: 0,
  discardSize: 0,
  drawSize: 17,
  players: {},
  playerOrder: [],
  state: LobbyState.SETUP,
  president: "",
  chancellor: "",
  electionTracker: 0,
  vetoOccurred: false,
  lastState: LobbyState.SETUP,
  lastChancellor: "",
  lastPresident: "",
  electionTrackerAdvanced: false,
  userVotes: {},
  presidentChoices: [],
  chancellorChoices: [],
  targetUser: "",
  lastPolicy: "",
  peek: [],
  icon: {},
};

const COOKIE_NAME = "name";
const COOKIE_LOBBY = "lobby";
const COOKIE_HIDE_ROLE = "hide-role";

/* Close reasons that reconnecting cannot get past. Anything else - a dropped
   network, a server restart, a browser suspending the page - is worth retrying. */
const TERMINAL_CLOSE_REASONS: { [reason: string]: string } = {
  [CLOSE_LOBBY_NOT_FOUND]: "The lobby no longer exists.",
  [CLOSE_NAME_TAKEN]: "Someone else is using that name in the lobby.",
  [CLOSE_LOBBY_FULL]: "The lobby is currently full.",
  [CLOSE_GAME_IN_PROGRESS]: "The lobby is currently in a game.",
  [CLOSE_LOBBY_TIMED_OUT]: "The lobby timed out.",
  [CLOSE_BAD_REQUEST]: "There was an error connecting to the server.",
  [CLOSE_REPLACED]: "This lobby was opened in another window.",
};

/**
 * Pulls the machine-readable part out of a websocket close reason, which the
 * server sends as "<reason>: <explanation>".
 * @param reason the raw close reason, which is empty when the connection dropped
 *               rather than being closed by the server.
 */
function parseCloseReason(reason: string | undefined): string {
  if (!reason) {
    return "";
  }
  const separator = reason.indexOf(":");
  return separator === -1 ? reason : reason.substring(0, separator);
}

if (DEBUG) {
  console.warn("Running in debug mode.");
}

// TODO: Turn App into a functional component
// TODO: Refactor out pages into separate components
// TODO: Refactor out AnimationQueue

// TODO: Remove this type and replace with actual state variables.
type AppState = {
  page: PAGE;
  joinName: string;
  joinLobby: string;
  joinError: string;
  createLobbyName: string;
  createLobbyError: string;
  name: string;
  lobby: string;
  lobbyFromURL: boolean;
  usernames: string[];
  icons: { [key: string]: string };
  gameState: GameState;
  /* Stores the last gameState[PARAM_STATE] value to check for changes. */
  lastState: any;
  liberalPolicies: number;
  fascistPolicies: number;
  /*The position of the election tracker, ranging from 0 to 3.*/
  electionTracker: number;
  showVotes: boolean;
  drawDeckSize: number;
  discardDeckSize: number;
  snackbarMessage: string;
  showAlert: boolean;
  alertContent: JSX.Element;
  showEventBar: boolean;
  eventBarMessage: string;
  statusBarText: string;
  allAnimationsFinished: boolean;
  /* Whether the player has chosen to conceal role information on this device,
     so a neighbour glancing at their screen cannot see their team. Persisted. */
  hideRole: boolean;
  /* True while a concealed role badge is held down to peek at it. Transient. */
  peekingRole: boolean;
  /* True while the connection to the server is down and being retried, so the
     player can see that the game is stalled rather than that nobody is moving. */
  connectionLost: boolean;
};

const defaultAppState: AppState = {
  page: PAGE.LOGIN,
  joinName: "",
  joinLobby: "",
  joinError: "",
  createLobbyName: "",
  createLobbyError: "",
  name: "P1",
  lobby: "AAAAAA",
  lobbyFromURL: false,
  usernames: [],
  icons: {},
  gameState: DEFAULT_GAME_STATE,
  lastState: {},
  liberalPolicies: 0,
  fascistPolicies: 0,
  electionTracker: 0,
  showVotes: false,
  drawDeckSize: 17,
  discardDeckSize: 0,
  snackbarMessage: "",
  showAlert: false,
  alertContent: <div />,
  showEventBar: false,
  eventBarMessage: "",
  statusBarText: "---",
  allAnimationsFinished: true,
  hideRole: false,
  peekingRole: false,
  connectionLost: false,
};

class App extends Component<{}, AppState> {
  websocket?: WebSocket = undefined;
  /* The credentials the current connection was opened with. Kept outside of
     component state so a reconnect never races a pending setState. */
  connectionName: string = "";
  connectionLobby: string = "";
  reconnectAttempts: number = 0;
  /* Whether the server has accepted the current connection. The websocket "open"
     event fires as soon as the handshake completes, which is before the server
     has decided whether to let this player in, so it is not on its own a sign
     that anything worked. */
  connectionConfirmed: boolean = false;
  reconnectTimer?: NodeJS.Timeout = undefined;
  /* When the connection first went down, used to decide when to stop retrying. */
  firstFailureTime: number = 0;
  /* Coming back to a tab fires several events at once (visibilitychange, focus,
     sometimes pageshow); this keeps that from becoming several round trips. */
  lastVerifyTime: number = 0;
  pingInterval?: NodeJS.Timeout = undefined;
  pongTimer?: NodeJS.Timeout = undefined;
  reconnectOnConnectionClosed: boolean = true;
  snackbarMessages: number = 0;
  animationQueue: (() => void)[] = [];
  okMessageListeners: (() => void)[] = [];
  allAnimationsFinished: boolean = true;
  gameOver: boolean = false;

  // noinspection DuplicatedCode
  constructor(props: any) {
    super(props);

    let name = Cookies.get(COOKIE_NAME) ? Cookies.get(COOKIE_NAME) : "";
    let lobby = Cookies.get(COOKIE_LOBBY) ? Cookies.get(COOKIE_LOBBY) : "";

    this.state = {
      ...defaultAppState,
      joinName: name || "",
      joinLobby: lobby || "",
      createLobbyName: name || "",
      hideRole: Cookies.get(COOKIE_HIDE_ROLE) === "true",
    };

    // The website uses Google Analytics!
    ReactGA.initialize("UA-166327773-1");
    ReactGA.pageview("/");

    // These are necessary for handling class fields safely (ex: websocket)
    this.onWebSocketClose = this.onWebSocketClose.bind(this);
    this.tryOpenWebSocket = this.tryOpenWebSocket.bind(this);
    this.verifyConnection = this.verifyConnection.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.onClickLeaveLobby = this.onClickLeaveLobby.bind(this);
    this.onClickCopy = this.onClickCopy.bind(this);
    this.onClickStartGame = this.onClickStartGame.bind(this);
    this.sendWSCommand = this.sendWSCommand.bind(this);
    this.showSnackBar = this.showSnackBar.bind(this);
    this.onAnimationFinish = this.onAnimationFinish.bind(this);
    this.onGameStateChanged = this.onGameStateChanged.bind(this);
    this.hideAlertAndFinish = this.hideAlertAndFinish.bind(this);
    this.addAnimationToQueue = this.addAnimationToQueue.bind(this);
    this.clearAnimationQueue = this.clearAnimationQueue.bind(this);
    this.queueAlert = this.queueAlert.bind(this);
    this.showChangeIconAlert = this.showChangeIconAlert.bind(this);
    this.updateChangeIconAlert = this.updateChangeIconAlert.bind(this);
    this.onClickChangeIcon = this.onClickChangeIcon.bind(this);
    this.onClickToggleHideRole = this.onClickToggleHideRole.bind(this);
    this.setPeekingRole = this.setPeekingRole.bind(this);

    // Ping the server to wake it up if it's not currently being used
    // This reduces the delay users experience when starting lobbies
    fetch(SERVER_ADDRESS_HTTP + SERVER_PING);
  }

  /////////// Server Communication
  // <editor-fold desc="Server Communication">

  /**
   * Attempts to request the server to create a new lobby and returns the response.
   * @return {Promise<Response>}
   */
  async tryCreateLobby() {
    return fetch(SERVER_ADDRESS_HTTP + NEW_LOBBY);
  }

  /**
   * Checks if the login is valid.
   * @param name the name of the user.
   * @param lobby the lobby code.
   * @return {Promise<Response>} The response from the server.
   */
  async tryLogin(name: string, lobby: string) {
    ReactGA.event({
      category: "Login Attempt",
      action: "User attempted to provide login credentials to the server.",
    });
    return await fetch(
      SERVER_ADDRESS_HTTP +
        CHECK_LOGIN +
        "?name=" +
        encodeURIComponent(name) +
        "&lobby=" +
        encodeURIComponent(lobby) +
        "&" +
        PARAM_CLIENT_ID +
        "=" +
        encodeURIComponent(getClientId())
    );
  }

  /**
   * Attempts to open a WebSocket with the server.
   * @param name the name of the user to connect with.
   * @param lobby the lobby to connect with.
   * @effects Opens a connection and records {@code name} and {@code lobby} as the
   *          credentials to reconnect with. The page is not moved on until the
   *          server actually accepts the connection, so a refused login leaves the
   *          player on the login page rather than flashing them into the lobby.
   * @return {boolean} true if the connection could be started. Otherwise, false.
   */
  tryOpenWebSocket(name: string, lobby: string) {
    this.connectionName = name;
    this.connectionLobby = lobby;
    // Opening a connection at all means the player wants to be in this lobby, so
    // a later drop should be reconnected rather than treated as them leaving.
    this.reconnectOnConnectionClosed = true;
    this.clearReconnectTimer();
    this.closeCurrentWebSocket();

    let url =
      WEBSOCKET_HEADER +
      SERVER_ADDRESS +
      WEBSOCKET +
      "?name=" +
      encodeURIComponent(name) +
      "&lobby=" +
      encodeURIComponent(lobby) +
      "&" +
      PARAM_CLIENT_ID +
      "=" +
      encodeURIComponent(getClientId());
    if (DEBUG) {
      console.log("Opening connection to lobby " + lobby + " at " + url);
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error("Could not open a websocket.", e);
      this.scheduleReconnect();
      return false;
    }

    this.websocket = ws;
    this.connectionConfirmed = false;
    this.setState({ name: name, lobby: lobby });

    // Every handler checks that this is still the current socket. A socket that
    // has been replaced can still deliver events, and acting on them would tear
    // down the connection that replaced it.
    ws.onopen = () => {
      if (this.websocket === ws) {
        // The handshake is done, but the server has not yet said whether this
        // player is welcome. Start the keep-alive and wait to hear back.
        this.startPing();
      }
    };
    ws.onmessage = (msg) => {
      if (this.websocket === ws) {
        this.onWebSocketMessage(msg);
      }
    };
    ws.onerror = () => {
      // Nothing to do here: an error is always followed by a close, which is
      // where reconnection is handled.
      if (DEBUG) {
        console.log("Websocket error on the connection to " + lobby + ".");
      }
    };
    ws.onclose = (event) => {
      if (this.websocket === ws) {
        this.websocket = undefined;
        this.onWebSocketClose(event);
      }
    };

    return true;
  }

  /**
   * Called on the first packet from the server, which is the point at which the
   * connection is known to have been accepted rather than merely opened.
   * @effects clears the reconnection state and tells the player they are back.
   */
  onConnectionConfirmed() {
    this.connectionConfirmed = true;
    this.reconnectAttempts = 0;
    this.firstFailureTime = 0;
    if (this.state.connectionLost) {
      this.showSnackBar("Reconnected.");
    }
    if (
      this.state.connectionLost ||
      this.state.joinError !== "" ||
      this.state.createLobbyError !== ""
    ) {
      this.setState({
        connectionLost: false,
        joinError: "",
        createLobbyError: "",
      });
    }
  }

  /**
   * Called when the websocket closes.
   * @param event the close event, whose reason says whether the server refused
   *              this connection and why.
   * @effects reconnects, unless the player closed the connection deliberately or
   *          the server gave a reason that reconnecting cannot get past.
   */
  onWebSocketClose(event: CloseEvent) {
    this.stopPing();

    const reason = parseCloseReason(event ? event.reason : "");
    if (DEBUG) {
      console.log(
        "The websocket closed (code " +
          (event ? event.code : "?") +
          ', reason "' +
          (event ? event.reason : "") +
          '").'
      );
    }

    if (!this.reconnectOnConnectionClosed) {
      // The player left the lobby, or the game ended and disconnecting is expected.
      if (!this.gameOver) {
        this.setState({
          page: PAGE.LOGIN,
          joinName: this.connectionName,
          joinLobby: this.connectionLobby,
          joinError: "",
          connectionLost: false,
        });
        this.clearAnimationQueue();
      }
      return;
    }

    if (this.state.page === PAGE.LOGIN) {
      // The connection closed before the player ever reached the lobby, so this is
      // a login that was turned away rather than a connection that was lost.
      // Retrying would leave them watching "Connecting..." with no explanation.
      this.reportLoginFailure(reason);
      return;
    }

    if (TERMINAL_CLOSE_REASONS[reason] !== undefined) {
      this.giveUpReconnecting(TERMINAL_CLOSE_REASONS[reason], reason);
      return;
    }

    this.scheduleReconnect();
  }

  /**
   * Shows why a login attempt was turned away, on whichever half of the login page
   * the player was using.
   * @param reason the machine-readable close reason, which is empty when the
   *               connection simply failed.
   */
  reportLoginFailure(reason: string) {
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.firstFailureTime = 0;
    const message =
      TERMINAL_CLOSE_REASONS[reason] ||
      "There was an error connecting to the server. Please try again.";
    if (this.state.createLobbyError !== "") {
      this.setState({ createLobbyError: message });
    } else {
      this.setState({
        joinName: this.connectionName,
        joinLobby: this.connectionLobby,
        joinError: message,
      });
    }
  }

  /**
   * Queues another connection attempt, backing off a little further each time.
   * @effects schedules a reconnect, or returns the player to the login page if
   *          the connection has been down for too long. Time spent with the page
   *          hidden does not count towards that, so a tab left in the background
   *          is still trying when the player comes back to it.
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      return; // an attempt is already queued
    }

    const now = Date.now();
    if (this.firstFailureTime === 0) {
      this.firstFailureTime = now;
    }
    if (
      this.isPageVisible() &&
      now - this.firstFailureTime > RECONNECT_GIVE_UP_AFTER
    ) {
      this.giveUpReconnecting("Disconnected from the lobby.", "timed-out");
      return;
    }

    if (this.reconnectAttempts >= 1 && !this.state.connectionLost) {
      this.setState({ connectionLost: true });
      ReactGA.event({
        category: "Lost Server Connection",
        action: "User lost connection to the server. (>1 attempts)",
      });
    }

    // The first retry is immediate: the usual cause is a connection the server
    // has just closed and will accept again straight away.
    const delay =
      this.reconnectAttempts === 0
        ? 0
        : Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts - 1),
            RECONNECT_MAX_DELAY
          );
    // Spread out the retries of everyone who dropped at once, so a server coming
    // back up is not hit by the whole lobby on the same tick.
    const jitter = Math.random() * delay * 0.3;
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.tryOpenWebSocket(this.connectionName, this.connectionLobby);
    }, delay + jitter);
  }

  /**
   * Stops trying to reconnect and returns the player to the login page.
   * @param message the explanation to show on the login page.
   * @param reason the machine-readable reason, for analytics.
   */
  giveUpReconnecting(message: string, reason: string) {
    if (DEBUG) {
      console.log("Giving up on the connection: " + reason);
    }
    this.clearReconnectTimer();
    this.stopPing();
    this.reconnectAttempts = 0;
    this.firstFailureTime = 0;
    this.setState({
      joinName: this.connectionName,
      joinLobby: this.connectionLobby,
      joinError: message,
      page: PAGE.LOGIN,
      connectionLost: false,
    });
    ReactGA.event({
      category: "Lost Server Connection (Terminal)",
      action: "User was unable to reconnect to the server. (" + reason + ")",
    });
    this.clearAnimationQueue();
  }

  /**
   * Whether there is a connection that can be sent on right now.
   */
  isConnectionOpen() {
    return (
      this.websocket !== undefined &&
      this.websocket.readyState === WebSocket.OPEN
    );
  }

  isPageVisible() {
    return (
      typeof document.visibilityState === "undefined" ||
      document.visibilityState === "visible"
    );
  }

  /**
   * Detaches and closes the current websocket without triggering a reconnect.
   */
  closeCurrentWebSocket() {
    const ws = this.websocket;
    this.websocket = undefined;
    this.stopPing();
    if (!ws) {
      return;
    }
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
      ws.close();
    } catch (e) {
      // Already gone; nothing to close.
    }
  }

  /**
   * Starts a connection attempt if there is not already a connection or a queued
   * attempt.
   */
  ensureConnected() {
    if (
      !this.reconnectOnConnectionClosed ||
      this.reconnectTimer ||
      this.state.page === PAGE.LOGIN ||
      this.connectionLobby === ""
    ) {
      return;
    }
    if (
      this.websocket &&
      (this.websocket.readyState === WebSocket.OPEN ||
        this.websocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.tryOpenWebSocket(this.connectionName, this.connectionLobby);
  }

  /**
   * Checks that the connection is really still alive, and reconnects if not.
   * @effects Called when the player comes back to the page or the network returns.
   *          A page that has been suspended often has a websocket that still
   *          reports itself as open but is long dead, so this asks the server to
   *          prove otherwise rather than trusting readyState.
   */
  verifyConnection() {
    if (this.state.page === PAGE.LOGIN || !this.reconnectOnConnectionClosed) {
      return;
    }
    const now = Date.now();
    if (now - this.lastVerifyTime < VERIFY_DEBOUNCE) {
      return;
    }
    this.lastVerifyTime = now;

    // The player is back and watching, so start their patience over.
    this.reconnectAttempts = 0;
    this.firstFailureTime = 0;
    this.clearPongTimer();

    if (!this.isConnectionOpen()) {
      this.clearReconnectTimer();
      this.ensureConnected();
      return;
    }

    // Ask for a fresh copy of the state in case anything was missed, and ping so
    // that a connection that has quietly died is noticed within PONG_TIMEOUT.
    this.sendWSCommand({ command: WSCommandType.GET_STATE });
    this.sendPing();
  }

  onVisibilityChange() {
    if (this.isPageVisible()) {
      this.verifyConnection();
    }
  }

  componentDidMount() {
    // Coming back to a page that was hidden, restored from the back/forward
    // cache, or offline are all moments when the connection is likely to be dead
    // without the browser having said so.
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("focus", this.verifyConnection);
    window.addEventListener("pageshow", this.verifyConnection);
    window.addEventListener("online", this.verifyConnection);
  }

  componentWillUnmount() {
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("focus", this.verifyConnection);
    window.removeEventListener("pageshow", this.verifyConnection);
    window.removeEventListener("online", this.verifyConnection);
    this.clearReconnectTimer();
    this.stopPing();
  }

  //////// Keep-alive

  startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => this.sendPing(), PING_INTERVAL);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
    this.clearPongTimer();
  }

  clearPongTimer() {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
    }
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Pings the server and, if the page is visible, starts waiting for a reply.
   * @effects if nothing comes back within {@code PONG_TIMEOUT} the connection is
   *          treated as dead and reopened. The wait is skipped while the page is
   *          hidden, because a hidden tab has its timers throttled and a late
   *          reply there proves nothing.
   */
  sendPing() {
    if (!this.isConnectionOpen()) {
      this.ensureConnected();
      return;
    }
    this.sendWSCommand({ command: WSCommandType.PING });

    if (!this.isPageVisible() || this.pongTimer) {
      return;
    }
    this.pongTimer = setTimeout(() => {
      this.pongTimer = undefined;
      console.log("The server stopped replying; reopening the connection.");
      this.tryOpenWebSocket(this.connectionName, this.connectionLobby);
    }, PONG_TIMEOUT);
  }

  async onWebSocketMessage(msg: MessageEvent) {
    // Any traffic at all proves the connection is alive and was accepted.
    this.clearPongTimer();
    if (!this.connectionConfirmed) {
      this.onConnectionConfirmed();
    }
    let message = JSON.parse(msg.data);
    // Decode message contents as communication is encoded
    if (DEBUG) {
      console.log(message);
    }
    switch (message[PARAM_PACKET_TYPE]) {
      case PACKET_LOBBY:
        this.setState({
          usernames: message[PARAM_USERNAMES],
          icons: message[PARAM_ICON],
          page: PAGE.LOBBY,
        });
        if (message[PARAM_ICON][this.state.name] === defaultPortrait) {
          this.showChangeIconAlert();
        }
        this.updateChangeIconAlert();
        break;

      case PACKET_GAME_STATE:
        if (message !== this.state.gameState) {
          this.onGameStateChanged(message);
        }
        this.setState({ gameState: message, page: PAGE.GAME });
        break;

      case PACKET_OK: // Traverse all listeners and call the functions.
        let i = 0;
        for (i; i < this.okMessageListeners.length && i < 1; i++) {
          this.okMessageListeners[i]();
        }
        this.okMessageListeners = []; // clear all listeners.
        break;

      case PACKET_INVESTIGATION:
        // Trigger investigation screen when the server responds.
        console.log(
          "Investigated player role: " + message[PARAM_INVESTIGATION]
        );
        // Set party to liberal/fascist using sent packet
        const party = message[PARAM_INVESTIGATION];

        this.queueAlert(
          <InvestigationAlert
            party={party}
            target={message[PARAM_TARGET]}
            hideAlert={this.hideAlertAndFinish}
          />,
          false
        );
        break;
      case PACKET_PONG:
      default:
      // No action
    }
  }

  /**
   * Sends a specified command to the server.
   * @param command the String command label.
   * @param params a dictionary of any parameters that need to be provided with the command.
   * @effects sends a message to the server with the following parameters:
   *          {@code PARAM_COMMAND}: {@code command}
   *          {@code PARAM_LOBBY}: {@code this.state.lobby}
   *          {@code PARAM_NAME}: {@code this.state.name}
   *          and each (key, value) pair in {@code params}.
   */
  sendWSCommand(request: ServerRequestPayload) {
    // Do not need to encode name + lobby because this is sent through websocket
    const data: WSCommand = {
      ...request,
      name: this.state.name,
      lobby: this.state.lobby,
    };

    if (DEBUG) {
      console.log(JSON.stringify(data));
    }
    if (!this.isConnectionOpen()) {
      if (request.command !== WSCommandType.PING) {
        this.showSnackBar("Not connected to the server: reconnecting...");
      }
      this.ensureConnected();
      return;
    }
    try {
      this.websocket!.send(JSON.stringify(data));
    } catch (e) {
      // The socket died between the readyState check and the send.
      console.error("Failed to send a command to the server.", e);
      this.showSnackBar("Not connected to the server: reconnecting...");
      this.tryOpenWebSocket(this.connectionName, this.connectionLobby);
    }
  }

  //</editor-fold>

  /////////////////// Login Page
  // <editor-fold desc="Login Page">

  /**
   * Updates the "Name" field under Join Game.
   * @param text the text to update the text field to.
   */
  updateJoinName = (text: string) => {
    this.setState({
      joinName: text,
    });
  };

  /**
   * Updates the Lobby field under Join Game.
   * @param text the text to update the text field to.
   */
  updateJoinLobby = (text: string) => {
    this.setState({
      joinLobby: text,
    });
  };

  /**
   * Updates the Name field under Create Lobby.
   * @param text the text to update the text field to.
   */
  updateCreateLobbyName = (text: string) => {
    this.setState({
      createLobbyName: text,
    });
  };

  shouldJoinButtonBeEnabled() {
    return (
      this.state.joinLobby.length === LOBBY_CODE_LENGTH &&
      this.state.joinName.length !== 0
    );
  }

  shouldCreateLobbyButtonBeEnabled() {
    return this.state.createLobbyName.length !== 0;
  }

  /**
   * Attempts to connect to the lobby via websocket.
   */
  onClickJoin = () => {
    const joinName = this.state.joinName;
    const joinLobby = this.state.joinLobby;
    this.setState({ joinError: "Connecting...", createLobbyError: "" });
    this.tryLogin(joinName, joinLobby)
      .then((response) => {
        if (!response.ok) {
          if (DEBUG) {
            console.log("Response is not ok");
          }
          if (response.status === 404) {
            this.setState({ joinError: "The lobby could not be found." });
            ReactGA.event({
              category: "Login Failed",
              action: "Lobby not found - User unable to connect.",
            });
          } else if (response.status === 403) {
            this.setState({
              joinError:
                "There is already a user with the name '" +
                joinName +
                "' in the lobby.",
            });
            ReactGA.event({
              category: "Login Failed",
              action: "Duplicate name - User unable to connect.",
            });
          } else if (response.status === 488) {
            this.setState({ joinError: "The lobby is currently in a game." });
            ReactGA.event({
              category: "Login Failed",
              action: "Ongoing game - User unable to connect.",
            });
          } else if (response.status === 489) {
            this.setState({ joinError: "The lobby is currently full." });
            ReactGA.event({
              category: "Login Failed",
              action: "Lobby full - User unable to connect.",
            });
          } else {
            this.setState({
              joinError:
                "There was an error connecting to the server. Please try again.",
            });
            ReactGA.event({
              category: "Login Failed",
              action: "Misc - User was unable to connect.",
            });
          }
        } else {
          // Username and lobby were verified. Try to open websocket.
          if (!this.tryOpenWebSocket(joinName, joinLobby)) {
            this.setState({
              joinError:
                "There was an error connecting to the server. Please try again.",
            });
          } else {
            // Save the username and lobby login. Read from the local values
            // rather than state, which tryOpenWebSocket has just replaced.
            Cookies.set(COOKIE_NAME, joinName, { expires: 7 });
            Cookies.set(COOKIE_LOBBY, joinLobby, { expires: 7 });
          }
        }
      })
      .catch(() => {
        this.setState({
          joinError:
            "There was an error contacting the server. Please wait and try again.",
        });
      });
  };

  /**
   * Attempts to connect to the server and create a new lobby, and then opens a connection to the lobby.
   */
  onClickCreateLobby = () => {
    const createLobbyName = this.state.createLobbyName;
    this.setState({ createLobbyError: "Connecting...", joinError: "" });
    this.tryCreateLobby()
      .then((response) => {
        if (response.ok) {
          response.text().then((lobbyCode) => {
            if (!this.tryOpenWebSocket(createLobbyName, lobbyCode)) {
              // if the connection failed
              this.setState({
                createLobbyError:
                  "There was an error connecting to the server. Please try again.",
              });
              ReactGA.event({
                category: "Lobby Creation Failed",
                action: "Failed to create a new lobby.",
              });
            } else {
              ReactGA.event({
                category: "Lobby Created",
                action: "Successfully created new lobby.",
              });
              // Save the username and lobby login. Read from the local value
              // rather than state, which tryOpenWebSocket has just replaced.
              Cookies.set(COOKIE_NAME, createLobbyName, { expires: 7 });
              Cookies.set(COOKIE_LOBBY, lobbyCode, { expires: 7 });
            }
          });
        } else {
          this.setState({
            createLobbyError:
              "There was an error connecting to the server. Please try again.",
          });
          ReactGA.event({
            category: "Lobby Creation Failed",
            action: "Failed to create a new lobby.",
          });
        }
      })
      .catch(() => {
        this.setState({
          createLobbyError:
            "There was an error connecting to the server. Please try again.",
        });
        ReactGA.event({
          category: "Lobby Creation Failed",
          action: "Failed to create a new lobby.",
        });
      });
  };

  renderLoginPage() {
    return (
      <div className="App">
        <header className="App-header">Secret Hitler</header>
        <br />
        <div style={{ textAlign: "center" }}>
          {/** TODO: Add reusable announcement component. 
                    <div style={{backgroundColor: "#222222", width: "50vmin", margin: "0 auto", padding: "20px"}}>
                        <p>
                            Hello! Secret Hitler is currently undergoing some maintenance.
                            Sorry for the interruption and please check back in in a few hours! -Shrimp
                        </p>
                        <p style={{fontStyle: "italic", fontSize: "calc(8px + 1vmin)"}}>(DATE TIME PM PT)</p>

                    </div>
                    */}
          <h2>JOIN A GAME</h2>
          <MaxLengthTextField
            label={"Lobby"}
            onChange={this.updateJoinLobby}
            value={this.state.joinLobby}
            maxLength={LOBBY_CODE_LENGTH}
            showCharCount={false}
            forceUpperCase={true}
          />

          <MaxLengthTextField
            label={"Your Name"}
            onChange={this.updateJoinName}
            value={this.state.joinName}
            maxLength={12}
          />
          <p id={"errormessage"}>{this.state.joinError}</p>
          <button
            onClick={this.onClickJoin}
            disabled={!this.shouldJoinButtonBeEnabled()}
          >
            JOIN
          </button>
        </div>
        <br />
        <div>
          <h2>CREATE A LOBBY</h2>
          <MaxLengthTextField
            label={"Your Name"}
            onChange={this.updateCreateLobbyName}
            value={this.state.createLobbyName}
            maxLength={12}
          />
          <p id={"errormessage"}>{this.state.createLobbyError}</p>
          <button
            onClick={this.onClickCreateLobby}
            disabled={!this.shouldCreateLobbyButtonBeEnabled()}
          >
            CREATE LOBBY
          </button>
        </div>
        <LoginPageContent />
      </div>
    );
  }

  //</editor-fold>

  /////////////////// Lobby Page
  //<editor-fold desc="Lobby Page">

  /**
   * Renders the playerlist as a sequence of paragraph tags.
   * Written as "{@literal <p>} - {@code username} {@literal </p>}".
   */
  renderPlayerList() {
    return this.state.usernames.map((name: string, i: number) => {
      return (
        <Player
          key={i}
          name={i === 0 ? name : name + " [Host]"}
          showRole={false}
          icon={this.state.icons[name]}
          isBusy={this.state.icons[name] === defaultPortrait}
          highlight={name === this.state.name}
        />
      );
    });
  }

  onClickChangeIcon() {
    this.showChangeIconAlert();
  }

  /**
   * Toggles whether role information is concealed on this device, and persists
   * the choice so it survives a refresh and carries into the next game.
   */
  onClickToggleHideRole() {
    const hideRole = !this.state.hideRole;
    this.setState({ hideRole, peekingRole: false });
    Cookies.set(COOKIE_HIDE_ROLE, String(hideRole), { expires: 7 });
  }

  /**
   * Called while a concealed role badge is held down, to reveal it for as long
   * as the press lasts.
   */
  setPeekingRole(peekingRole: boolean) {
    this.setState({ peekingRole });
  }

  updateChangeIconAlert() {
    this.setState({
      alertContent: (
        <IconSelection
          onConfirm={() => {
            this.clearAnimationQueue();
            this.hideAlertAndFinish();
          }}
          sendWSCommand={this.sendWSCommand}
          playerToIcon={this.state.icons}
          players={this.state.usernames}
          user={this.state.name}
        />
      ),
    });
  }

  showChangeIconAlert() {
    this.queueAlert(<div />, false); // false here prevents dialog from closing when server confirms selection
    this.updateChangeIconAlert();
  }

  /**
   * Determines whether the 'Start Game' button in the lobby should be enabled.
   */
  shouldStartGameBeEnabled() {
    // Verify that all players have icons
    for (let i = 0; i < this.state.usernames.length; i++) {
      if (this.state.icons[this.state.usernames[i]] === defaultPortrait) {
        return false;
      }
    }
    return true;
  }

  /**
   * Contacts the server and requests to start the game.
   */
  onClickStartGame() {
    ReactGA.event({
      category: "Starting Game",
      action: this.state.usernames.length + " players started game.",
    });
    this.sendWSCommand({ command: WSCommandType.START_GAME });
  }

  onClickLeaveLobby() {
    // Set this first: close() can deliver its event before the next statement.
    this.reconnectOnConnectionClosed = false;
    // Tell the server this is a deliberate exit so it frees the seat straight
    // away, rather than holding it open for a reconnect that is not coming.
    if (this.isConnectionOpen()) {
      this.sendWSCommand({ command: WSCommandType.LEAVE_LOBBY });
    }
    this.clearReconnectTimer();
    this.stopPing();
    this.websocket?.close();
  }

  onClickCopy() {
    const text = document.getElementById("linkText");
    if (text === null) {
      return;
    }
    (text as HTMLTextAreaElement).select();
    (text as HTMLTextAreaElement).setSelectionRange(0, 999999);
    document.execCommand("copy");
    this.showSnackBar("Copied!");
  }

  showSnackBar(message: string) {
    this.setState({ snackbarMessage: message });
    let snackbar = document.getElementById("snackbar");
    if (snackbar === null) {
      return;
    }
    snackbar.className = "show";
    this.snackbarMessages++;
    setTimeout(() => {
      this.snackbarMessages--;
      if (this.snackbarMessages === 0) {
        snackbar!.className = snackbar!.className.replace("show", "");
      }
    }, 3000);
  }

  renderLobbyPage() {
    // The first player in the lobby is counted as the VIP.
    let isVIP =
      this.state.usernames.length > 0 &&
      this.state.usernames[0] === this.state.name;
    return (
      <div className="App">
        <header className="App-header">Secret Hitler</header>

        <CustomAlert show={this.state.showAlert}>
          {this.state.alertContent}
        </CustomAlert>

        <div
          style={{ textAlign: "left", marginLeft: "20px", marginRight: "20px" }}
        >
          <div style={{ display: "flex", flexDirection: "row" }}>
            <h2>LOBBY CODE: </h2>
            <h2
              style={{ marginLeft: "5px", color: "var(--textColorHighlight)" }}
            >
              {this.state.lobby}
            </h2>
          </div>

          <p style={{ marginBottom: "2px" }}>
            Copy and share this link to invite other players.
          </p>
          <div
            style={{
              textAlign: "left",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <textarea
              id="linkText"
              readOnly={true}
              value={
                window.location.origin + "/?lobby=" + this.state.lobby
              }
            />
            <button onClick={this.onClickCopy}>COPY</button>
          </div>

          <div id={"lobby-lower-container"}>
            <div id={"lobby-player-area-container"}>
              <div id={"lobby-player-text-choose-container"}>
                <p id={"lobby-player-count-text"}>
                  Players ({this.state.usernames.length}/10)
                </p>
                <button
                  id={"lobby-change-icon-button"}
                  onClick={this.onClickChangeIcon}
                >
                  CHANGE ICON
                </button>
              </div>
              <div id={"lobby-player-container"}>{this.renderPlayerList()}</div>
            </div>

            <div id={"lobby-button-container"}>
              {!isVIP && (
                <p id={"lobby-vip-text"}>Only the VIP can start the game.</p>
              )}
              <button
                onClick={this.onClickStartGame}
                disabled={!isVIP || !this.shouldStartGameBeEnabled()}
              >
                START GAME
              </button>
              <button onClick={this.onClickLeaveLobby}>LEAVE LOBBY</button>
            </div>
            <div id={"lobby-text-container"}>
              <p id={"lobby-about-text"}>
                <a
                  href={"https://github.com/joshzoi/Secret-Hitler-Online"}
                  target={"_blank"}
                  rel="noopener noreferrer"
                >
                  About this project
                </a>
              </p>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div id="snackbar">{this.state.snackbarMessage}</div>
        </div>
      </div>
    );
  }

  //</editor-fold>

  /////////////////// Game Page
  //<editor-fold desc="Game Page">

  showExecutionResults(name: string, newState: GameState): void {
    if (name === newState.targetUser) {
      this.queueAlert(
        <ButtonPrompt
          label={"YOU HAVE BEEN EXECUTED"}
          headerText={
            "Executed players may not speak, vote, or run for office. You should not reveal your identity to the group."
          }
          buttonOnClick={this.hideAlertAndFinish}
        />,
        false
      );
    } else {
      this.queueAlert(
        <ButtonPrompt
          label={"EXECUTION RESULTS"}
          footerText={
            newState.targetUser +
            " has been executed. They may no longer speak, vote, or run for office."
          }
          buttonOnClick={this.hideAlertAndFinish}
          buttonText={"OKAY"}
        >
          <PlayerDisplay
            user={name}
            gameState={newState}
            showRoles={false}
            playerDisabledFilter={DISABLE_EXECUTED_PLAYERS}
            players={[newState.targetUser!]}
          />
        </ButtonPrompt>,
        false
      );
    }
  }

  /**
   * Queues animations for when the game state has changed.
   * @param newState {Object} the new game state sent from the server.
   */
  onGameStateChanged(newState: GameState) {
    let oldState = this.state.gameState;
    let name = this.state.name;
    let isPresident = this.state.name === newState.president;
    let isChancellor = this.state.name === newState.chancellor;
    let state = newState.state;

    // If last state was setup, which indicates that the client is re-entering the game or starting the game, then
    // we set the card count, liberal/fascist policy count, and the tracker.
    if (
      oldState.hasOwnProperty(PARAM_STATE) &&
      oldState[PARAM_STATE] === STATE_SETUP
    ) {
      this.setState({
        liberalPolicies: newState.liberalPolicies,
        fascistPolicies: newState.fascistPolicies,
        electionTracker: newState.electionTracker,
        drawDeckSize: newState.drawSize,
        discardDeckSize: newState.discardSize,
      });
    }

    // Check for changes in enacted policies and election tracker.
    const statesToShowPolicyFor = [
      LobbyState.POST_LEGISLATIVE,
      LobbyState.PP_INVESTIGATE,
      LobbyState.PP_EXECUTION,
      LobbyState.PP_ELECTION,
      LobbyState.PP_PEEK,
      LobbyState.FASCIST_VICTORY_POLICY,
      LobbyState.LIBERAL_VICTORY_POLICY,
    ];
    if (statesToShowPolicyFor.includes(state)) {
      // Check if the election tracker changed positions.
      if (newState.electionTracker !== this.state.gameState.electionTracker) {
        let newPos = newState.electionTracker;
        let advancedToThree = newPos === 0 && newState.electionTrackerAdvanced;
        // We ignore all resets to 0, unless that reset was caused by the election tracker reaching 3.
        if (newPos !== 0 || advancedToThree) {
          // If the last phase was voting, we failed due to voting. Therefore, show votes.
          if (oldState[PARAM_STATE] === STATE_CHANCELLOR_VOTING) {
            //this.queueAlert(<RoleAlert onClick={this.hideAlertAndFinish} />);
            this.addAnimationToQueue(() => this.showVotes(newState));
          }

          let trackerPosition = newPos;
          if (advancedToThree) {
            // If the tracker was reset because it advanced to 3, show it moving to 3 in the dialog box.
            trackerPosition = 3;
          }
          this.queueAlert(
            <ElectionTrackerAlert
              trackerPosition={trackerPosition}
              closeAlert={this.hideAlertAndFinish}
            />
          );
        }
      }

      let liberalChanged =
        newState.liberalPolicies !== oldState.liberalPolicies;
      let fascistChanged =
        newState.fascistPolicies !== oldState.fascistPolicies;

      if (liberalChanged || fascistChanged) {
        // Show an alert with the new policy
        this.queueAlert(
          <PolicyEnactedAlert
            hideAlert={this.hideAlertAndFinish}
            policyType={newState.lastPolicy}
          />
        );
      }

      // Update the decks, board with the new policies / election tracker.
      this.addAnimationToQueue(() => {
        this.setState({
          liberalPolicies: newState.liberalPolicies,
          fascistPolicies: newState.fascistPolicies,
          electionTracker: newState.electionTracker,
        });
        setTimeout(() => this.onAnimationFinish(), 500);
      });
    }

    // Check for state change
    if (newState[PARAM_STATE] !== this.state.gameState[PARAM_STATE]) {
      // state has changed
      switch (newState[PARAM_STATE]) {
        case STATE_CHANCELLOR_NOMINATION:
          if (
            newState.electionTracker === 0 &&
            newState.liberalPolicies === 0 &&
            newState.fascistPolicies === 0
          ) {
            // If the game has just started (everything in default state), show the player's role.
            this.queueAlert(
              <RoleAlert
                role={newState.players[this.state.name].id}
                gameState={newState}
                name={name}
                onClick={() => {
                  this.hideAlertAndFinish();
                }}
              />,
              false
            );
          }

          this.queueEventUpdate("CHANCELLOR NOMINATION");
          this.queueStatusMessage(
            "Waiting for president to nominate a chancellor."
          );

          if (isPresident) {
            //Show the chancellor nomination window.
            this.queueAlert(
              SelectNominationPrompt(name, newState, this.sendWSCommand)
            );
          }

          break;

        case STATE_CHANCELLOR_VOTING:
          this.setState({ statusBarText: "" });
          this.queueEventUpdate("VOTING");
          this.queueStatusMessage("Waiting for all players to vote.");
          // Check if the player is dead or has already voted-- if so, do not show the voting prompt.
          if (
            newState.players[name][PLAYER_IS_ALIVE] &&
            !Object.keys(newState.userVotes).includes(name)
          ) {
            this.queueAlert(
              <VotingPrompt
                gameState={newState}
                sendWSCommand={this.sendWSCommand}
                user={this.state.name}
              />,
              true
            );
          }

          break;

        case STATE_LEGISLATIVE_PRESIDENT:
          // The vote completed, so show the votes.
          this.addAnimationToQueue(() => this.showVotes(newState));
          this.queueEventUpdate("LEGISLATIVE SESSION");

          // TODO: Animate cards being pulled from the draw deck for all users.

          this.queueStatusMessage(
            "Waiting for the president to choose a policy to discard."
          );

          if (isPresident) {
            if (!newState.presidentChoices) {
              throw new Error("President choices not found.");
            }
            this.queueAlert(
              <PresidentLegislativePrompt
                policyOptions={newState.presidentChoices}
                sendWSCommand={this.sendWSCommand}
              />
            );
          }

          break;

        case STATE_LEGISLATIVE_CHANCELLOR:
          this.queueStatusMessage(
            "Waiting for the chancellor to choose a policy to enact."
          );
          if (isChancellor) {
            if (!newState.chancellorChoices) {
              throw new Error("Chancellor choices not found.");
            }
            this.queueAlert(
              <ChancellorLegislativePrompt
                fascistPolicies={newState.fascistPolicies}
                showError={(message: string) =>
                  this.setState({ snackbarMessage: message })
                }
                policyOptions={newState.chancellorChoices}
                sendWSCommand={this.sendWSCommand}
                // Disable if veto has already happened
                enableVeto={
                  newState.fascistPolicies === 5 && !newState.vetoOccurred
                }
              />
            );
          }
          break;

        case STATE_LEGISLATIVE_PRESIDENT_VETO:
          this.queueStatusMessage(
            "Chancellor has motioned to veto the agenda. Waiting for the president to decide."
          );
          if (isPresident) {
            this.queueAlert(
              <VetoPrompt
                sendWSCommand={this.sendWSCommand}
                electionTracker={newState.electionTracker}
              />,
              true
            );
          }
          break;

        case STATE_PP_PEEK:
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            if (!newState.peek) {
              throw new Error("Peek policies not found.");
            }
            this.queueAlert(
              <PeekPrompt
                policies={newState.peek}
                sendWSCommand={this.sendWSCommand}
              />,
              true
            );
          } else {
            this.queueStatusMessage(
              "Peek: President is previewing the next 3 policies."
            );
          }
          break;

        case STATE_PP_ELECTION:
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            this.queueAlert(
              SelectSpecialElectionPrompt(name, newState, this.sendWSCommand)
            );
          } else {
            this.queueStatusMessage(
              "Special Election: President is choosing the next president."
            );
          }
          break;

        case STATE_PP_EXECUTION:
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            this.queueAlert(
              SelectExecutionPrompt(name, newState, this.sendWSCommand),
              true
            );
          } else {
            this.queueStatusMessage(
              "Execution: President is choosing a player to execute."
            );
          }
          break;

        case STATE_PP_INVESTIGATE:
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            this.queueAlert(
              SelectInvestigationPrompt(name, newState, this.sendWSCommand)
            );
          } else {
            this.queueStatusMessage(
              "Investigation: President is choosing a player to investigate."
            );
          }
          break;

        case STATE_POST_LEGISLATIVE:
          // Show results of any special elections, executions, or investigations.
          switch (newState.lastState) {
            case STATE_PP_ELECTION:
              if (!isPresident) {
                console.log("Special Election Alert: " + newState.targetUser);
                this.queueAlert(
                  <ButtonPrompt
                    label={"SPECIAL ELECTION"}
                    footerText={
                      newState[PARAM_PRESIDENT] +
                      " has chosen " +
                      newState.targetUser +
                      " to be the next president." +
                      "\nThe normal presidential order will resume after the next round."
                    }
                    buttonText={"OKAY"}
                    buttonOnClick={this.hideAlertAndFinish}
                  >
                    <PlayerDisplay
                      user={name}
                      gameState={newState}
                      showLabels={false}
                      players={[newState.targetUser!]}
                    />
                  </ButtonPrompt>,
                  false
                );
              }
              break;
            case STATE_PP_EXECUTION:
              // If player was executed
              this.showExecutionResults(name, newState);
              break;
            case STATE_PP_INVESTIGATE:
              if (!isPresident) {
                let isTarget = newState.targetUser === name;
                let footerText = isTarget
                  ? `You have been investigated by ${newState[PARAM_PRESIDENT]}. The president now knows your party affiliation.`
                  : `${newState.targetUser} has been investigated by ${newState[PARAM_PRESIDENT]}. The president now knows their party affiliation.`;
                this.queueAlert(
                  <ButtonPrompt
                    label={"INVESTIGATION RESULTS"}
                    // If target: You have been investigated by [President Name].
                    //            The president now knows your party affiliation.
                    // If not target: [Target Name] has been investigated by [President Name].
                    //                The president now knows their party affiliation.
                    footerText={footerText}
                    buttonOnClick={this.hideAlertAndFinish}
                    buttonText={"OKAY"}
                  >
                    <PlayerDisplay
                      user={name}
                      gameState={newState}
                      showLabels={false}
                      players={[newState.targetUser!]}
                    />
                  </ButtonPrompt>,
                  true
                );
              } else {
                // Is President; do nothing because we handle the
                // response directly from the server.
              }
              break;
            case STATE_PP_PEEK: // No additional case is necessary for peeking.
            default:
          }

          this.queueStatusMessage(
            "Waiting for the president to end their term."
          );
          break;

        case STATE_LIBERAL_VICTORY_EXECUTION:
        case STATE_FASCIST_VICTORY_ELECTION:
        case STATE_FASCIST_VICTORY_POLICY:
        case STATE_LIBERAL_VICTORY_POLICY:
          // Show normal enactments when victory events happen.
          if (newState.state === STATE_LIBERAL_VICTORY_EXECUTION) {
            this.showExecutionResults(name, newState);
          }
          if (newState.state === STATE_FASCIST_VICTORY_ELECTION) {
            this.addAnimationToQueue(() => this.showVotes(newState));
          }
          // Policies will already be shown for policy-based victories.
          // If the game was won via election, show the votes.

          // Divide fascist and liberal players.
          const fascistPlayers: string[] = [];
          const liberalPlayers: string[] = [];
          newState.playerOrder.forEach((player) => {
            const role = newState.players[player].id;
            if (role === Role.FASCIST || role === Role.HITLER) {
              fascistPlayers.push(player);
            } else {
              liberalPlayers.push(player);
            }
          });

          let victoryMessage: string,
            messageClass: string,
            headerImage: string,
            headerAlt: string;
          let players: string[] = [];
          let state = newState.state;
          let fascistVictoryPolicy = state === STATE_FASCIST_VICTORY_POLICY;
          let fascistVictoryElection = state === STATE_FASCIST_VICTORY_ELECTION;
          let liberalVictoryPolicy = state === STATE_LIBERAL_VICTORY_POLICY;
          let liberalVictoryExecution =
            state === STATE_LIBERAL_VICTORY_EXECUTION;
          let playerID = newState.players[name].id;
          let playerWon =
            (playerID === Role.LIBERAL &&
              (liberalVictoryExecution || liberalVictoryPolicy)) ||
            (playerID !== Role.LIBERAL &&
              (fascistVictoryElection || fascistVictoryPolicy));

          // Register player victory/loss with analytics.
          // TODO: Only register if player is host, or if player is the only
          // non-bot player in the game.
          if (playerWon) {
            ReactGA.event({
              category: "Victory",
              action: playerID + " team won the game.",
            });
          } else {
            ReactGA.event({
              category: "Loss",
              action: playerID + " team lost the game.",
            });
          }

          if (fascistVictoryElection || fascistVictoryPolicy) {
            players = fascistPlayers.concat(liberalPlayers);
            headerImage = VictoryFascistHeader;
            headerAlt = "Fascist Victory, written in red with a skull icon.";
            messageClass = "highlight";
            if (fascistVictoryPolicy) {
              victoryMessage = "Fascists successfully passed six policies!";
            } else if (fascistVictoryElection) {
              victoryMessage =
                "Fascists successfully elected Hitler as chancellor!";
            }
          } else {
            players = liberalPlayers.concat(fascistPlayers);
            headerImage = VictoryLiberalHeader;
            headerAlt = "Liberal Victory, written in blue with a dove icon.";
            messageClass = "highlight-blue";
            if (liberalVictoryPolicy) {
              victoryMessage = "Liberals successfully passed five policies!";
            } else if (liberalVictoryExecution) {
              victoryMessage = "Liberals successfully executed Hitler!";
            }
          }
          if (DEBUG) {
            console.log("Player ordering: " + players);
          }
          this.addAnimationToQueue(() => {
            this.setState({
              alertContent: (
                <ButtonPrompt
                  renderLabel={() => {
                    return (
                      <>
                        <img
                          src={headerImage}
                          alt={headerAlt}
                          id={"victory-header"}
                        />
                        <p
                          style={{ textAlign: "center" }}
                          className={messageClass}
                        >
                          {victoryMessage}
                        </p>
                      </>
                    );
                  }}
                  buttonText={"RETURN TO LOBBY"}
                  buttonOnClick={() => {
                    this.gameOver = false;
                    this.reconnectOnConnectionClosed = true;
                    this.reconnectAttempts = 0;
                    this.firstFailureTime = 0;
                    this.tryOpenWebSocket(this.state.name, this.state.lobby);
                    this.hideAlertAndFinish();
                    this.setState({
                      page: PAGE.LOBBY,
                      gameState: DEFAULT_GAME_STATE,
                      liberalPolicies: 0,
                      fascistPolicies: 0,
                      electionTracker: 0,
                      drawDeckSize: 17,
                      discardDeckSize: 0,
                    });
                  }}
                >
                  <PlayerDisplay
                    players={players}
                    playerDisabledFilter={DISABLE_NONE}
                    showRoles={true}
                    showLabels={false}
                    useAsButtons={false}
                    user={this.state.name}
                    gameState={newState}
                  />
                </ButtonPrompt>
              ),
              showAlert: true,
            });
          });
          this.gameOver = true;
          this.reconnectOnConnectionClosed = false;
          this.clearReconnectTimer();
          this.stopPing();
          this.websocket?.close();
          break;

        default:
        // Do nothing
      }
    }

    // Update the draw decks
    this.addAnimationToQueue(() => {
      this.setState({
        drawDeckSize: newState.drawSize,
        discardDeckSize: newState.discardSize,
      });
      this.onAnimationFinish();
    });
  }

  //// Animation Handling
  // <editor-fold desc="Animation Handling">

  /**
   * Plays the next animation in the queue if it exists.
   * @effects If {@code this.animationQueue} is not empty,
   *          removes the function at the front of the animation queue and calls it.
   */
  onAnimationFinish() {
    if (this.animationQueue.length > 0) {
      let func = this.animationQueue.shift();
      if (func !== undefined) {
        func(); //call the function.
      }
    } else {
      // the animation queue is empty, so we set a flag.
      this.allAnimationsFinished = true;
      this.setState({ allAnimationsFinished: true });
    }
  }

  /**
   * Clears the animation queue and ends any currently playing animations.
   */
  clearAnimationQueue() {
    this.allAnimationsFinished = true;
    this.setState({ allAnimationsFinished: true });
    this.animationQueue = [];
  }

  /**
   * Adds the specified animation to the end of the queue.
   * @param func {function} the function to add to the animation queue.
   * @effects Adds the function to the back of the animation queue. If no animations are currently playing,
   *          starts the specified animation.
   */
  addAnimationToQueue(func: () => void) {
    this.animationQueue.push(func);
    if (this.allAnimationsFinished) {
      this.allAnimationsFinished = false;
      this.setState({ allAnimationsFinished: false });
      let func = this.animationQueue.shift();
      if (func !== undefined) {
        func(); //call the function.
      }
    }
  }

  showVotes(newState: GameState) {
    this.setState({ statusBarText: "Tallying votes..." });
    setTimeout(() => {
      this.setState({ showVotes: true });
    }, 1000);
    // Calculate final result:

    let noVotes = 0;
    let yesVotes = 0;
    Object.values(newState.userVotes).forEach((value) => {
      if (value) {
        yesVotes++;
      } else {
        noVotes++;
      }
    });
    setTimeout(() => {
      if (yesVotes > noVotes) {
        this.setState({
          statusBarText: yesVotes + " - " + noVotes + ": Vote passed",
        });
      } else {
        this.setState({
          statusBarText: yesVotes + " - " + noVotes + ": Vote failed",
        });
      }
    }, 2000);
    setTimeout(
      () => this.setState({ showVotes: false, statusBarText: "" }),
      6000
    );
    setTimeout(() => {
      this.onAnimationFinish();
    }, 6500);
  }

  /**
   * Adds a listener to be called when the server returns an 'OK' status.
   * @param func The function to be called.
   * @effects adds the listener to the queue of functions. When the server returns an 'OK' status, all of the
   *          listeners will be called and then cleared from the queue.
   */
  addServerOKListener(func: () => void) {
    this.okMessageListeners.push(func);
  }

  /**
   * Hides the CustomAlert and marks this animation as finished.
   * @param delayExit {boolean} When true, delays advancing the animation queue until after the alert is hidden.
   * @effects: Sets {@code this.state.showAlert} to false and hides the CustomAlert.
   *           If delayExit is true, waits until the CustomAlert is done hiding before advancing the animation queue.
   *           Otherwise, immediately queues the next animation.
   */
  hideAlertAndFinish(delayExit = true) {
    this.setState({ showAlert: false });
    if (delayExit) {
      setTimeout(() => {
        this.setState({ alertContent: <div /> }); // reset the alert box contents
        this.onAnimationFinish();
      }, CUSTOM_ALERT_FADE_DURATION);
    } else {
      this.setState({ alertContent: <div /> });
      this.onAnimationFinish();
    }
  }

  /**
   * Shows the eventBar for a set period of time.
   * @param message {String} the message for the Event Bar to be fully visible.
   * @param duration {Number} the duration (in ms) for the Event Bar to be visible. (default is 3000 ms).
   * @effects Adds a function to the animation queue that, when called, shows the EventBar with the given message
   *          for {@code duration} ms, then advances to the next animation when finished.
   */
  queueEventUpdate(message: string, duration = 2000) {
    this.addAnimationToQueue(() => {
      this.setState({
        showEventBar: true,
        eventBarMessage: message,
      });
      setTimeout(() => {
        this.setState({ showEventBar: false });
      }, duration);
      setTimeout(() => {
        this.onAnimationFinish();
      }, duration + EVENT_BAR_FADE_OUT_DURATION);
    });
  }

  /**
   * Adds a CustomAlert to the animation queue.
   * @param content {html} the contents to be shown in the AlertBox.
   * @param closeOnOK {boolean} whether to close the alert when the server responds with an ok message. (default = true)
   * @effects Adds a new function to the animation queue that, when called, causes a CustomAlert with the
   *          given {@code content} to appear. If {@code closeOnOK} is true, once shown, the alert box will
   *          be closed when the server responds with an 'ok' to any command. (There will be a short delay before the
   *          animation queue advances if not waiting for a server response.)
   */
  queueAlert(content: React.JSX.Element, closeOnOK = true) {
    this.addAnimationToQueue(() => {
      this.setState({
        alertContent: content,
        showAlert: true,
      });
      if (closeOnOK) {
        // Remove the exit delay if waiting for the server response, because otherwise the player will lag
        // behind everyone else.
        this.addServerOKListener(() => this.hideAlertAndFinish(false));
      }
    });
  }

  /**
   * Adds an update to the status message to the animation queue.
   * @param message {String} the text for the status bar to display.
   * @effects Adds a new function to the animation queue that, when called, updates {@code this.state.statusBarText} to
   *          the message provided then instantly advances the animation queue.
   */
  queueStatusMessage(message: string) {
    this.addAnimationToQueue(() => {
      this.setState({ statusBarText: message });
      this.onAnimationFinish();
    });
  }

  // </editor-fold>

  /**
   * Renders the game page.
   */
  renderGamePage() {
    return (
      <div className="App" style={{ textAlign: "center" }}>
        <header className="App-header">Secret Hitler</header>

        <CustomAlert show={this.state.showAlert}>
          {this.state.alertContent}
        </CustomAlert>

        <EventBar
          show={this.state.showEventBar}
          message={this.state.eventBarMessage}
        />

        <div style={{ backgroundColor: "var(--backgroundDark)" }}>
          <div id={"hide-role-container"}>
            <p id={"hide-role-text"}>
              {this.state.hideRole
                ? "Roles hidden. Hold a ? to peek."
                : "Playing in the same room?"}
            </p>
            <button
              id={"hide-role-button"}
              className={this.state.hideRole ? "alt" : ""}
              onClick={this.onClickToggleHideRole}
            >
              {this.state.hideRole ? "SHOW ROLE" : "HIDE ROLE"}
            </button>
          </div>
          <PlayerDisplay
            gameState={this.state.gameState}
            user={this.state.name}
            showVotes={this.state.showVotes}
            showBusy={this.state.allAnimationsFinished} // Only show busy when there isn't an active animation.
            playerDisabledFilter={DISABLE_EXECUTED_PLAYERS}
          />
        </div>

        <StatusBar>{this.state.statusBarText}</StatusBar>

        <div style={{ display: "inline-block" }}>
          <div
            id={"Board Layout"}
            style={{
              alignItems: "center",
              display: "flex",
              flexDirection: "column",
              margin: "10px auto",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                marginTop: "15px",
              }}
            >
              <Deck cardCount={this.state.drawDeckSize} deckType={"DRAW"} />

              <div style={{ margin: "auto auto" }}>
                <button
                  disabled={
                    this.state.gameState[PARAM_STATE] !==
                      STATE_POST_LEGISLATIVE ||
                    this.state.name !== this.state.gameState[PARAM_PRESIDENT]
                  }
                  onClick={() => {
                    this.sendWSCommand({ command: WSCommandType.END_TERM });
                  }}
                >
                  {" "}
                  END TERM
                </button>

                <PlayerPolicyStatus
                  numFascistPolicies={this.state.fascistPolicies}
                  numLiberalPolicies={this.state.liberalPolicies}
                  playerCount={this.state.gameState.playerOrder.length}
                />
              </div>

              <Deck
                cardCount={this.state.discardDeckSize}
                deckType={"DISCARD"}
              />
            </div>

            <Board
              numPlayers={this.state.gameState.playerOrder.length}
              numFascistPolicies={this.state.fascistPolicies}
              numLiberalPolicies={this.state.liberalPolicies}
              electionTracker={this.state.electionTracker}
            />
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div id="snackbar">{this.state.snackbarMessage}</div>
        </div>
      </div>
    );
  }

  //</editor-fold>

  render() {
    // Check URL params. If joining from a lobby link, open the lobby with the given code.
    let url = window.location.search;
    let lobby = new URLSearchParams(url).get("lobby");
    if (lobby !== null && !this.state.lobbyFromURL) {
      ReactGA.event({
        category: "Lobby Link",
        action: "User is using a lobby link.",
      });
      this.setState({
        joinLobby: lobby.toUpperCase().substr(0, 4),
        lobbyFromURL: true,
      });
    }

    let page_render;
    switch (this.state.page) {
      case PAGE.LOBBY:
        page_render = this.renderLobbyPage();
        break;
      case PAGE.GAME:
        page_render = this.renderGamePage();
        break;
      case PAGE.LOGIN: // login is default
      default:
        page_render = this.renderLoginPage();
    }
    return (
      <RoleVisibilityContext.Provider
        value={{
          masked: this.state.hideRole && !this.state.peekingRole,
          setPeeking: this.setPeekingRole,
        }}
      >
        <HelmetMetaData />
        {this.state.connectionLost && (
          <div id="connection-banner">
            Reconnecting to the server&hellip;
          </div>
        )}
        {page_render}
      </RoleVisibilityContext.Provider>
    );
  }
}

export default App;
