import React, { Component } from "react";
import ReactGA from "react-ga";
import "./App.css";
import "./Lobby.css";
import "./fonts.css";
import CustomAlert from "./custom-alert/CustomAlert";
import RoleAlert from "./custom-alert/RoleAlert";
import EventBar from "./event-bar/EventBar";

// TODO: replace constants with enums from types
import {
  PAGE,
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
  CLOSE_LOBBY_FULL,
  CLOSE_GAME_IN_PROGRESS,
  CLOSE_LOBBY_TIMED_OUT,
  CLOSE_BAD_REQUEST,
  CLOSE_REPLACED,
  PARAM_REQUEST_ID,
  SERVER_TIMEOUT,
  PARAM_INVESTIGATION,
  PACKET_ERROR,
  PARAM_MESSAGE,
  PARAM_AVATARS,
  PARAM_YOU,
  MIN_PLAYERS,
  MAX_PLAYERS,
  CLOSE_UNAUTHENTICATED,
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
import HelmetMetaData from "./util/HelmetMetaData";
import Player from "./player/Player";
import Cookies from "js-cookie";
import {
  checkLogin,
  createLobby,
  getSession,
  SessionExpiredError,
  signOut,
} from "./util/api";
import {
  consumeUrlParams,
  rememberPendingLobby,
  takePendingLobby,
} from "./util/urlParams";
import { AuthStatus, SessionUser } from "./types/auth";
import SignInPage from "./login/SignInPage";
import HomePage from "./login/HomePage";
import { RoleVisibilityContext } from "./util/RoleVisibilityContext";
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
  avatars: {},
};

/* The one preference still worth keeping on the device. Identity comes from the
   Slack session now, so the name and lobby cookies are gone. */
const COOKIE_HIDE_ROLE = "hide-role";

/* How long to wait before admitting that signing in is taking a while. A warm
   server answers well within this, and a flash of the message is worse than
   showing nothing. */
const SLOW_SIGN_IN_NOTICE_DELAY = 600;

/* What went wrong at Slack, in words meant for the player. The server sends a
   short code so that its own wording, which is aimed at developers, never ends
   up on the page. */
const AUTH_ERROR_MESSAGES: { [reason: string]: string } = {
  denied: "Sign-in was cancelled.",
  expired: "That sign-in took too long. Please try again.",
  wrong_workspace:
    "That Slack account is not in this game's workspace. Sign in with your work account.",
  slack: "Slack could not complete the sign-in. Please try again.",
  bad_request: "Something went wrong signing in. Please try again.",
  not_configured:
    "This server has not been set up for Slack sign-in yet.",
};

function describeAuthError(reason: string): string {
  return AUTH_ERROR_MESSAGES[reason] || "Sign-in failed. Please try again.";
}

/* Close reasons that reconnecting cannot get past. Anything else - a dropped
   network, a server restart, a browser suspending the page - is worth retrying. */
const TERMINAL_CLOSE_REASONS: { [reason: string]: string } = {
  [CLOSE_LOBBY_NOT_FOUND]: "The lobby no longer exists.",
  [CLOSE_LOBBY_FULL]: "The lobby is currently full.",
  [CLOSE_GAME_IN_PROGRESS]: "The lobby is currently in a game.",
  [CLOSE_LOBBY_TIMED_OUT]: "The lobby timed out.",
  [CLOSE_BAD_REQUEST]: "There was an error connecting to the server.",
  [CLOSE_UNAUTHENTICATED]: "Your session expired. Please sign in again.",
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

/* Commands the client sends to keep itself healthy, as opposed to the player
   acting on the game. Only a real action closes an action prompt or holds one
   back; housekeeping traffic must never stand in for one. */
const HOUSEKEEPING_COMMANDS: string[] = [
  WSCommandType.PING,
  WSCommandType.GET_STATE,
  WSCommandType.LEAVE_LOBBY,
];

/**
 * Whether a command is the player acting on the game.
 * @param command the command being sent.
 */
function isPlayerAction(command: WSCommandType): boolean {
  return !HOUSEKEEPING_COMMANDS.includes(command);
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
  /* Whether we know who the player is yet. Kept apart from PAGE, which says which
     game screen is showing and is driven by packets from the server. */
  authStatus: AuthStatus;
  session?: SessionUser;
  /* Why a sign-in did not work, shown on the sign-in screen. */
  authError: string;
  /* True when the server could not be reached at all, as opposed to refusing us.
     That gets a retry rather than another trip to Slack. */
  authUnreachable: boolean;
  /* A lobby from an invite link, joined as soon as we know who the player is. */
  pendingLobby?: string;
  joinLobby: string;
  joinError: string;
  createLobbyError: string;
  /* The name the server gave this player in this lobby. Never typed by them. */
  name: string;
  lobby: string;
  usernames: string[];
  avatars: { [key: string]: string };
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
  /* True while the connection to the server is down and being retried, so the
     player can see that the game is stalled rather than that nobody is moving. */
  connectionLost: boolean;
  /* True once signing in has taken long enough to be worth mentioning. */
  showSlowSignIn: boolean;
};

const defaultAppState: AppState = {
  page: PAGE.LOGIN,
  authStatus: "checking",
  session: undefined,
  authError: "",
  authUnreachable: false,
  pendingLobby: undefined,
  joinLobby: "",
  joinError: "",
  createLobbyError: "",
  name: "",
  lobby: "",
  usernames: [],
  avatars: {},
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
  connectionLost: false,
  showSlowSignIn: false,
};

class App extends Component<{}, AppState> {
  websocket?: WebSocket = undefined;
  /* The credentials the current connection was opened with. Kept outside of
     component state so a reconnect never races a pending setState. */
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
  allAnimationsFinished: boolean = true;
  gameOver: boolean = false;
  /* Callbacks waiting on the server's acknowledgement of one particular command,
     keyed by the request id it was sent with. Keying them is what stops an
     unrelated "ok" -- a get-state on returning to the tab, say -- from standing
     in for the one an action prompt is waiting on and closing it unanswered. */
  pendingAcks: Map<number, () => void> = new Map();
  nextRequestId: number = 1;
  /* Set while an action prompt is on screen that should close once the action
     sent from it is acknowledged, so each action sent from that prompt waits on
     its own reply. Cleared when the prompt closes. */
  closeAlertOnAck: boolean = false;
  /* Mirrors state.showAlert without waiting for a render, so a check for whether
     a prompt is already up is right in the same tick that one was shown. */
  alertShowing: boolean = false;
  /* True from sending an action until the state that accounts for it arrives, so
     the prompt for an action already on its way is not offered a second time. */
  actionInFlight: boolean = false;
  actionInFlightTimer?: NodeJS.Timeout = undefined;
  /* The most recent game state, mirrored outside of component state. Animations
     triggered while a packet is being handled can finish before the setState
     carrying that packet has been applied, so this is what tells them which
     actions are still outstanding. */
  latestGameState: GameState = DEFAULT_GAME_STATE;
  /* Set while waiting to hear whether the player is signed in. */
  slowSignInTimer?: NodeJS.Timeout = undefined;

  // noinspection DuplicatedCode
  constructor(props: any) {
    super(props);

    this.state = {
      ...defaultAppState,
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
    this.onClickToggleHideRole = this.onClickToggleHideRole.bind(this);
    this.reconcileActionPrompt = this.reconcileActionPrompt.bind(this);
    this.handleSessionExpired = this.handleSessionExpired.bind(this);
    this.onClickSignOut = this.onClickSignOut.bind(this);
    this.onClickCreateLobby = this.onClickCreateLobby.bind(this);
    this.joinLobby = this.joinLobby.bind(this);
    this.loadSession = this.loadSession.bind(this);
    this.updateJoinLobby = this.updateJoinLobby.bind(this);
  }

  /////////// Signing in
  // <editor-fold desc="Signing in">

  /**
   * Finds out who the player is.
   *
   * Runs before anything else is shown, so the sign-in screen does not flash up
   * in front of somebody who is already signed in.
   */
  async loadSession() {
    this.setState({ authStatus: "checking", authError: "", authUnreachable: false });
    try {
      const session = await getSession();
      if (session === null) {
        this.setState({ authStatus: "signed-out", session: undefined, name: "" });
        return;
      }
      this.setState({
        authStatus: "signed-in",
        session,
        name: session.name,
        authError: "",
        authUnreachable: false,
      });

      // An invite link followed before signing in. There is no name to type any
      // more, so it can be acted on straight away.
      const pending = this.state.pendingLobby ?? takePendingLobby();
      if (pending) {
        this.setState({ pendingLobby: undefined, joinLobby: pending });
        this.joinLobby(pending);
      }
    } catch (e) {
      // A server that cannot be reached is not the same as being signed out, and
      // saying "you were signed out" to someone waiting on a cold start is wrong.
      console.error("Could not check the sign-in status.", e);
      this.setState({
        authStatus: "signed-out",
        session: undefined,
        authUnreachable: true,
        authError: "Couldn't reach the server. It may still be waking up.",
      });
    }
  }

  /**
   * Gives up on the current session and sends the player back to signing in.
   *
   * @effects tears down the connection first, so the reconnect loop cannot bring
   *          a dead session back to life, then shows the sign-in screen.
   */
  handleSessionExpired() {
    this.reconnectOnConnectionClosed = false;
    this.clearReconnectTimer();
    this.stopPing();
    this.closeCurrentWebSocket();
    this.clearAnimationQueue();
    this.setState({
      page: PAGE.LOGIN,
      authStatus: "signed-out",
      session: undefined,
      name: "",
      connectionLost: false,
      showAlert: false,
      authUnreachable: false,
      authError: "Your session expired. Please sign in again.",
    });
  }

  async onClickSignOut() {
    // Close the socket before revoking the session, so the reconnect logic does
    // not immediately try to open another one with a cookie that no longer works.
    this.reconnectOnConnectionClosed = false;
    this.clearReconnectTimer();
    this.stopPing();
    this.closeCurrentWebSocket();
    await signOut();
    this.setState({
      ...defaultAppState,
      hideRole: this.state.hideRole,
      authStatus: "signed-out",
    });
  }

  //</editor-fold>

  /////////// Server Communication
  // <editor-fold desc="Server Communication">

  /**
   * Attempts to open a WebSocket with the server.
   * @param lobby the lobby to connect to.
   * @effects Opens a connection and records {@code lobby} as the one to reconnect
   *          to. Who the player is comes from the session cookie the handshake
   *          carries, not from the URL. The page is not moved on until the server
   *          actually accepts the connection, so a refused login leaves the player
   *          where they were rather than flashing them into the lobby.
   * @return {boolean} true if the connection could be started. Otherwise, false.
   */
  tryOpenWebSocket(lobby: string) {
    this.connectionLobby = lobby;
    // Opening a connection at all means the player wants to be in this lobby, so
    // a later drop should be reconnected rather than treated as them leaving.
    this.reconnectOnConnectionClosed = true;
    this.clearReconnectTimer();
    this.closeCurrentWebSocket();

    // Only the lobby. The session cookie rides along with the handshake, so no
    // credential ever appears in a URL, a log, or the browser's history.
    let url =
      WEBSOCKET_HEADER +
      SERVER_ADDRESS +
      WEBSOCKET +
      "?lobby=" +
      encodeURIComponent(lobby);
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
    // The name is not ours to choose; it arrives with the first packet.
    this.setState({ lobby: lobby });

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
    if (reason === CLOSE_UNAUTHENTICATED) {
      // Checked before anything else: this is final wherever it turns up, and
      // retrying it would spin against a session that will never work again.
      this.handleSessionExpired();
      return;
    }
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
      this.tryOpenWebSocket(this.connectionLobby);
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
    // Nothing sent on the old connection is going to be answered now.
    this.pendingAcks.clear();
    this.clearActionInFlight();
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
    this.tryOpenWebSocket(this.connectionLobby);
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
    window.addEventListener("pageshow", this.onPageShow);
    window.addEventListener("online", this.verifyConnection);

    // Read here rather than in the constructor: StrictMode runs a constructor
    // twice in development, and this both writes to history and starts a request.
    const params = consumeUrlParams();
    if (params.lobby) {
      rememberPendingLobby(params.lobby);
    }
    const pending = params.lobby ?? takePendingLobby();
    this.setState({
      pendingLobby: pending,
      joinLobby: pending ?? "",
      authError: params.authError ? describeAuthError(params.authError) : "",
    });

    // Only say anything if it is taking long enough to notice. A warm server
    // answers well inside this, and a flash of "signing you in" is worse than
    // nothing at all.
    this.slowSignInTimer = setTimeout(
      () => this.setState({ showSlowSignIn: true }),
      SLOW_SIGN_IN_NOTICE_DELAY
    );
    this.loadSession().finally(() => {
      if (this.slowSignInTimer) {
        clearTimeout(this.slowSignInTimer);
        this.slowSignInTimer = undefined;
      }
      this.setState({ showSlowSignIn: false });
    });
  }

  componentWillUnmount() {
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("focus", this.verifyConnection);
    window.removeEventListener("pageshow", this.onPageShow);
    window.removeEventListener("online", this.verifyConnection);
    this.clearReconnectTimer();
    if (this.slowSignInTimer) {
      clearTimeout(this.slowSignInTimer);
    }
    this.stopPing();
  }

  /**
   * Handles the page being shown, including from the back/forward cache.
   *
   * A page restored from that cache has the JavaScript state it had when the
   * player navigated away -- which, coming back from Slack, is from before they
   * signed in. Checking again avoids showing a signed-out page to somebody who
   * has just signed in.
   */
  onPageShow = (event: PageTransitionEvent) => {
    if (event && event.persisted) {
      this.loadSession();
      return;
    }
    this.verifyConnection();
  };

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
      this.tryOpenWebSocket(this.connectionLobby);
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
          avatars: message[PARAM_AVATARS] || {},
          // The lobby may have disambiguated the name from the session, so take
          // it from the packet rather than assuming they match.
          name: message[PARAM_YOU] ?? this.state.name,
          page: PAGE.LOBBY,
        });
        break;

      case PACKET_GAME_STATE:
        // The state now accounts for anything already sent, so a prompt held back
        // for an action in flight can be offered again if it is still owed.
        this.clearActionInFlight();
        this.latestGameState = message;
        if (message !== this.state.gameState) {
          this.onGameStateChanged(message);
        }
        this.setState(
          {
            gameState: message,
            avatars: message[PARAM_AVATARS] || {},
            name: message[PARAM_YOU] ?? this.state.name,
            page: PAGE.GAME,
          },
          () => this.reconcileActionPrompt()
        );
        break;

      case PACKET_OK: {
        // Answer only the command this "ok" names. One connection's commands are
        // handled in order, so anything still waiting from before it never will
        // be. An "ok" without an id is from an older server: nothing to match, so
        // nothing is closed on the strength of it.
        const requestId = message[PARAM_REQUEST_ID];
        const onAck = this.pendingAcks.get(requestId);
        this.pendingAcks.forEach((_, id) => {
          if (id <= requestId) {
            this.pendingAcks.delete(id);
          }
        });
        if (onAck !== undefined) {
          onAck();
        }
        break;
      }

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
      case PACKET_ERROR:
        // The server refused something we asked for and stayed connected. Say why.
        this.showSnackBar(message[PARAM_MESSAGE]);
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
    const requestId = this.nextRequestId++;
    const data: WSCommand = {
      ...request,
      lobby: this.state.lobby,
      [PARAM_REQUEST_ID]: requestId,
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
      this.tryOpenWebSocket(this.connectionLobby);
      return;
    }

    if (!isPlayerAction(request.command)) {
      return;
    }
    // The action is on its way. Hold the prompt for it back until the state that
    // accounts for it arrives, and close the prompt it was sent from when this
    // command in particular is acknowledged -- not on the next "ok" to turn up.
    this.setActionInFlight();
    if (this.closeAlertOnAck) {
      // Stays armed until the prompt actually closes, so a retry after a send
      // that never got out waits on the reply to the attempt that did.
      this.pendingAcks.set(requestId, () => this.hideAlertAndFinish(false));
    }
  }

  /**
   * Records that an action has been sent and the game state has not caught up.
   * @effects holds back the prompt for that action until the next state packet,
   *          or until {@code SERVER_TIMEOUT} passes if no state ever arrives, so
   *          a command the server dropped is eventually offered again.
   */
  setActionInFlight() {
    this.clearActionInFlight();
    this.actionInFlight = true;
    this.actionInFlightTimer = setTimeout(() => {
      this.actionInFlightTimer = undefined;
      this.actionInFlight = false;
      this.reconcileActionPrompt();
    }, SERVER_TIMEOUT);
  }

  clearActionInFlight() {
    if (this.actionInFlightTimer) {
      clearTimeout(this.actionInFlightTimer);
      this.actionInFlightTimer = undefined;
    }
    this.actionInFlight = false;
  }

  //</editor-fold>

  /////////////////// Login Page
  // <editor-fold desc="Login Page">

  /**
   * Updates the Lobby field under Join Game.
   * @param text the text to update the text field to.
   */
  updateJoinLobby(text: string) {
    this.setState({
      joinLobby: text,
    });
  }

  /**
   * Joins a lobby by code.
   *
   * @param code the lobby to join.
   * @effects checks with the server first, so a refusal can be explained on the
   *          page rather than arriving as a closed websocket.
   */
  joinLobby(code: string) {
    if (!code || code.length !== LOBBY_CODE_LENGTH) {
      this.setState({ joinError: "Enter a four letter lobby code." });
      return;
    }
    this.setState({
      joinError: "Connecting...",
      createLobbyError: "",
      joinLobby: code,
    });
    ReactGA.event({
      category: "Login Attempt",
      action: "User attempted to join a lobby.",
    });

    checkLogin(code)
      .then((response) => {
        if (!response.ok) {
          if (response.status === 404) {
            this.setState({ joinError: "The lobby could not be found." });
          } else if (response.status === 488) {
            this.setState({ joinError: "The lobby is currently in a game." });
          } else if (response.status === 489) {
            this.setState({ joinError: "The lobby is currently full." });
          } else {
            this.setState({
              joinError:
                "There was an error connecting to the server. Please try again.",
            });
          }
          return;
        }
        if (!this.tryOpenWebSocket(code)) {
          this.setState({
            joinError:
              "There was an error connecting to the server. Please try again.",
          });
        }
      })
      .catch((e) => {
        if (e instanceof SessionExpiredError) {
          this.handleSessionExpired();
          return;
        }
        this.setState({
          joinError:
            "There was an error contacting the server. Please wait and try again.",
        });
      });
  }

  /**
   * Creates a new lobby and connects to it.
   */
  onClickCreateLobby() {
    this.setState({ createLobbyError: "Connecting...", joinError: "" });
    createLobby()
      .then((lobbyCode) => {
        if (!this.tryOpenWebSocket(lobbyCode)) {
          this.setState({
            createLobbyError:
              "There was an error connecting to the server. Please try again.",
          });
          ReactGA.event({
            category: "Lobby Creation Failed",
            action: "Failed to create a new lobby.",
          });
          return;
        }
        ReactGA.event({
          category: "Lobby Created",
          action: "Successfully created new lobby.",
        });
      })
      .catch((e) => {
        if (e instanceof SessionExpiredError) {
          this.handleSessionExpired();
          return;
        }
        this.setState({
          createLobbyError:
            "There was an error connecting to the server. Please try again.",
        });
        ReactGA.event({
          category: "Lobby Creation Failed",
          action: "Failed to create a new lobby.",
        });
      });
  }

  /**
   * Renders whichever of the three pre-game screens applies: waiting to find out
   * who the player is, asking them to sign in, or the signed-in home screen.
   */
  renderLoginPage() {
    if (this.state.authStatus === "checking") {
      return (
        <div className="App">
          <header className="App-header">Secret Hitler</header>
          {this.state.showSlowSignIn && (
            <p id={"lobby-vip-text"}>Signing you in&hellip;</p>
          )}
        </div>
      );
    }

    if (this.state.authStatus === "signed-out" || this.state.session === undefined) {
      return (
        <SignInPage
          authError={this.state.authError}
          unreachable={this.state.authUnreachable}
          pendingLobby={this.state.pendingLobby}
          onRetry={this.loadSession}
        />
      );
    }

    return (
      <HomePage
        session={this.state.session}
        lobbyCode={this.state.joinLobby}
        onLobbyCodeChange={this.updateJoinLobby}
        onJoin={this.joinLobby}
        onCreate={this.onClickCreateLobby}
        onSignOut={this.onClickSignOut}
        onSessionExpired={this.handleSessionExpired}
        joinError={this.state.joinError}
        createError={this.state.createLobbyError}
        busy={this.state.joinError === "Connecting..." ||
          this.state.createLobbyError === "Connecting..."}
      />
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
          name={i === 0 ? name + " [Host]" : name}
          showRole={false}
          avatarUrl={this.state.avatars[name]}
          highlight={name === this.state.name}
        />
      );
    });
  }


  /**
   * Toggles whether role information is concealed on this device, and persists
   * the choice so it survives a refresh and carries into the next game.
   */
  onClickToggleHideRole() {
    const hideRole = !this.state.hideRole;
    this.setState({ hideRole });
    Cookies.set(COOKIE_HIDE_ROLE, String(hideRole), {
      expires: 7,
      sameSite: "lax",
    });
  }

  /**
   * Determines whether the 'Start Game' button in the lobby should be enabled.
   * There are no bots to pad a short lobby out, so the game needs enough real
   * players before it can begin.
   */
  shouldStartGameBeEnabled() {
    return this.state.usernames.length >= MIN_PLAYERS;
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
    // The first player in the lobby is the host.
    let isHost =
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
                  Players ({this.state.usernames.length}/{MAX_PLAYERS})
                </p>
              </div>
              <div id={"lobby-player-container"}>{this.renderPlayerList()}</div>
            </div>

            <div id={"lobby-button-container"}>
              {!isHost && (
                <p id={"lobby-vip-text"}>Only the host can start the game.</p>
              )}
              {isHost && this.state.usernames.length < MIN_PLAYERS && (
                <p id={"lobby-vip-text"}>
                  Need at least {MIN_PLAYERS} players to start.
                </p>
              )}
              <button
                onClick={this.onClickStartGame}
                disabled={!isHost || !this.shouldStartGameBeEnabled()}
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
   * Returns the prompt for whatever action the player still owes the game.
   * @param state {Object} the game state to read.
   * @return the prompt for the action this player has yet to take, or undefined
   *         if they are only waiting on somebody else. This is derived from the
   *         state alone rather than from a change in it, so the same answer holds
   *         for a state that has merely been re-sent -- which is what lets a
   *         prompt be offered again after an action failed to reach the server.
   */
  getPendingActionPrompt(state: GameState): React.JSX.Element | undefined {
    const name = this.state.name;
    const player = state.players[name];
    if (player === undefined || !player[PLAYER_IS_ALIVE]) {
      return undefined; // never in the game, or executed: never asked to act
    }
    const isPresident = name === state.president;
    const isChancellor = name === state.chancellor;

    switch (state.state) {
      case STATE_CHANCELLOR_NOMINATION:
        return isPresident
          ? SelectNominationPrompt(name, state, this.sendWSCommand)
          : undefined;

      case STATE_CHANCELLOR_VOTING:
        // A vote already registered with the server is not asked for again.
        return Object.keys(state.userVotes).includes(name) ? undefined : (
          <VotingPrompt
            gameState={state}
            sendWSCommand={this.sendWSCommand}
            user={name}
          />
        );

      case STATE_LEGISLATIVE_PRESIDENT:
        if (!isPresident) {
          return undefined;
        }
        if (!state.presidentChoices) {
          console.error("President choices not found.");
          return undefined;
        }
        return (
          <PresidentLegislativePrompt
            policyOptions={state.presidentChoices}
            sendWSCommand={this.sendWSCommand}
          />
        );

      case STATE_LEGISLATIVE_CHANCELLOR:
        if (!isChancellor) {
          return undefined;
        }
        if (!state.chancellorChoices) {
          console.error("Chancellor choices not found.");
          return undefined;
        }
        return (
          <ChancellorLegislativePrompt
            fascistPolicies={state.fascistPolicies}
            showError={(message: string) =>
              this.setState({ snackbarMessage: message })
            }
            policyOptions={state.chancellorChoices}
            sendWSCommand={this.sendWSCommand}
            // Disable if veto has already happened
            enableVeto={state.fascistPolicies === 5 && !state.vetoOccurred}
          />
        );

      case STATE_LEGISLATIVE_PRESIDENT_VETO:
        return isPresident ? (
          <VetoPrompt
            sendWSCommand={this.sendWSCommand}
            electionTracker={state.electionTracker}
          />
        ) : undefined;

      case STATE_PP_PEEK:
        if (!isPresident) {
          return undefined;
        }
        if (!state.peek) {
          console.error("Peek policies not found.");
          return undefined;
        }
        return (
          <PeekPrompt policies={state.peek} sendWSCommand={this.sendWSCommand} />
        );

      case STATE_PP_ELECTION:
        return isPresident
          ? SelectSpecialElectionPrompt(name, state, this.sendWSCommand)
          : undefined;

      case STATE_PP_EXECUTION:
        return isPresident
          ? SelectExecutionPrompt(name, state, this.sendWSCommand)
          : undefined;

      case STATE_PP_INVESTIGATE:
        return isPresident
          ? SelectInvestigationPrompt(name, state, this.sendWSCommand)
          : undefined;

      default:
        // Every other state is one the player can only wait out.
        return undefined;
    }
  }

  /**
   * Queues the prompt for the action the player owes in {@code state}, if any.
   * @param state {Object} the game state to read.
   */
  queueActionPrompt(state: GameState) {
    const prompt = this.getPendingActionPrompt(state);
    if (prompt !== undefined) {
      this.queueAlert(prompt);
    }
  }

  /**
   * Offers the prompt for an action the player still owes but has nothing on
   * screen to make it with.
   * @effects shows that prompt, if the client is otherwise idle. Prompts are
   *          normally raised by a change of state, so an action that never
   *          reached the server -- sent on a connection that had quietly died,
   *          say -- would otherwise leave the player waiting on a prompt that is
   *          never coming back, with the rest of the table waiting on them.
   */
  reconcileActionPrompt() {
    if (
      this.state.page !== PAGE.GAME ||
      this.gameOver ||
      this.alertShowing ||
      !this.allAnimationsFinished ||
      this.actionInFlight
    ) {
      return;
    }
    this.queueActionPrompt(this.latestGameState);
  }

  /**
   * Queues animations for when the game state has changed.
   * @param newState {Object} the new game state sent from the server.
   */
  onGameStateChanged(newState: GameState) {
    let oldState = this.state.gameState;
    let name = this.state.name;
    let isPresident = this.state.name === newState.president;
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

          //Show the chancellor nomination window (to the president only).
          this.queueActionPrompt(newState);

          break;

        case STATE_CHANCELLOR_VOTING:
          this.setState({ statusBarText: "" });
          this.queueEventUpdate("VOTING");
          this.queueStatusMessage("Waiting for all players to vote.");
          // A player who is dead, or who has already voted, is not asked to.
          this.queueActionPrompt(newState);

          break;

        case STATE_LEGISLATIVE_PRESIDENT:
          // The vote completed, so show the votes.
          this.addAnimationToQueue(() => this.showVotes(newState));
          this.queueEventUpdate("LEGISLATIVE SESSION");

          // TODO: Animate cards being pulled from the draw deck for all users.

          this.queueStatusMessage(
            "Waiting for the president to choose a policy to discard."
          );

          this.queueActionPrompt(newState);

          break;

        case STATE_LEGISLATIVE_CHANCELLOR:
          this.queueStatusMessage(
            "Waiting for the chancellor to choose a policy to enact."
          );
          this.queueActionPrompt(newState);
          break;

        case STATE_LEGISLATIVE_PRESIDENT_VETO:
          this.queueStatusMessage(
            "Chancellor has motioned to veto the agenda. Waiting for the president to decide."
          );
          this.queueActionPrompt(newState);
          break;

        case STATE_PP_PEEK:
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            this.queueActionPrompt(newState);
          } else {
            this.queueStatusMessage(
              "Peek: President is previewing the next 3 policies."
            );
          }
          break;

        case STATE_PP_ELECTION:
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            this.queueActionPrompt(newState);
          } else {
            this.queueStatusMessage(
              "Special Election: President is choosing the next president."
            );
          }
          break;

        case STATE_PP_EXECUTION:
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            this.queueActionPrompt(newState);
          } else {
            this.queueStatusMessage(
              "Execution: President is choosing a player to execute."
            );
          }
          break;

        case STATE_PP_INVESTIGATE:
          this.queueEventUpdate("PRESIDENTIAL POWER");
          if (isPresident) {
            this.queueActionPrompt(newState);
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
                    this.tryOpenWebSocket(this.state.lobby);
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
      // Nothing left to play: the right moment to notice that the player still
      // owes the game an action and has nothing on screen to make it with.
      this.reconcileActionPrompt();
    }
  }

  /**
   * Clears the animation queue and ends any currently playing animations.
   */
  clearAnimationQueue() {
    this.allAnimationsFinished = true;
    this.setState({ allAnimationsFinished: true });
    this.animationQueue = [];
    this.alertShowing = false;
    this.closeAlertOnAck = false;
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
   * Hides the CustomAlert and marks this animation as finished.
   * @param delayExit {boolean} When true, delays advancing the animation queue until after the alert is hidden.
   * @effects: Sets {@code this.state.showAlert} to false and hides the CustomAlert.
   *           If delayExit is true, waits until the CustomAlert is done hiding before advancing the animation queue.
   *           Otherwise, immediately queues the next animation.
   */
  hideAlertAndFinish(delayExit = true) {
    this.alertShowing = false;
    this.closeAlertOnAck = false;
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
      this.alertShowing = true;
      this.setState({
        alertContent: content,
        showAlert: true,
      });
      // Arm the close without committing to any particular reply yet: the prompt
      // closes when the action sent from it is acknowledged, which sendWSCommand
      // arranges once it knows which command that is. Waiting on the next "ok"
      // instead used to close prompts the player had not answered.
      this.closeAlertOnAck = closeOnOK;
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
                ? "Roles hidden on this device."
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
      <RoleVisibilityContext.Provider value={{ masked: this.state.hideRole }}>
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
