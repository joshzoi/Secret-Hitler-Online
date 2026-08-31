import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import {
  PACKET_ERROR,
  PACKET_GAME_STATE,
  PACKET_LOBBY,
  PACKET_OK,
  PARAM_ICON,
  PARAM_MESSAGE,
  PARAM_PACKET_TYPE,
  PARAM_REQUEST_ID,
  PARAM_USERNAMES,
} from "./constants";
import {
  GameState,
  LobbyState,
  PlayerState,
  Role,
  WSCommandType,
} from "./types";

// Analytics is not what this is testing, and react-ga's initialize looks for a
// script tag to insert itself before, which a bare test page does not have.
jest.mock("react-ga");

type Handler<T> = ((event: T) => void) | null;

/**
 * A stand-in for the browser's WebSocket that records what was sent and lets a
 * test hand packets back as though the server had sent them.
 */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState: number = FakeWebSocket.OPEN;
  sent: string[] = [];
  onopen: Handler<Event> = null;
  onmessage: Handler<{ data: string }> = null;
  onerror: Handler<Event> = null;
  onclose: Handler<{ code: number; reason: string }> = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }

  /** The most recent command of the given type, or undefined if never sent. */
  lastCommand(command: WSCommandType) {
    return this.sent
      .map((message) => JSON.parse(message))
      .filter((message) => message.command === command)
      .pop();
  }

  /** Delivers a packet to the client as though the server had sent it. */
  deliver(packet: object) {
    act(() => {
      this.onmessage!({ data: JSON.stringify(packet) });
    });
  }
}

const PLAYERS = ["Alice", "Bob", "Carol", "Dave", "Erin"];
const ME = "Alice";
/* Long enough for the event bar and status message queued alongside a prompt to
   play out, but short of the four seconds after which the client gives up on
   hearing back about an action it sent. */
const ANIMATION_TIME = 3000;

/**
 * Builds a game state packet with Alice waiting to vote on Carol's nomination.
 * @param overrides fields to change from that starting point.
 */
function votingState(overrides: Partial<GameState> = {}): GameState {
  const players: Record<string, PlayerState> = {};
  const icon: Record<string, string> = {};
  PLAYERS.forEach((player) => {
    players[player] = { alive: true, investigated: false };
    icon[player] = "p_default";
  });
  players[ME].id = Role.LIBERAL; // the server only sends the player their own role

  return {
    state: LobbyState.CHANCELLOR_VOTING,
    lastState: LobbyState.CHANCELLOR_NOMINATION,
    playerOrder: PLAYERS,
    players,
    president: "Bob",
    chancellor: "Carol",
    lastPresident: "",
    lastChancellor: "",
    electionTracker: 0,
    electionTrackerAdvanced: false,
    userVotes: {},
    liberalPolicies: 0,
    fascistPolicies: 0,
    drawSize: 17,
    discardSize: 0,
    lastPolicy: "FASCIST",
    vetoOccurred: false,
    icon,
    ...overrides,
  };
}

function gameStatePacket(overrides: Partial<GameState> = {}) {
  return {
    [PARAM_PACKET_TYPE]: PACKET_GAME_STATE,
    ...votingState(overrides),
  };
}

function okPacket(requestId: number) {
  return {
    [PARAM_PACKET_TYPE]: PACKET_OK,
    [PARAM_REQUEST_ID]: requestId,
  };
}

/** Plays out any queued animations. */
function runAnimations(ms = ANIMATION_TIME) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

/** Renders the app and connects it to a lobby as Alice. */
async function joinLobby() {
  render(<App />);
  const fields = screen.getAllByRole("textbox");
  fireEvent.change(fields[0], { target: { value: "ABCD" } }); // lobby code
  fireEvent.change(fields[1], { target: { value: ME } });

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "JOIN" }));
  });

  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  act(() => {
    ws.onopen!({} as Event);
  });
  return ws;
}

/** Whether the voting prompt is on screen. */
function isVotingPromptShown() {
  return screen.queryByAltText("Nein (No)") !== null;
}

/** Casts a vote through the voting prompt and returns the command that was sent. */
function voteNo(ws: FakeWebSocket) {
  fireEvent.click(screen.getByAltText("Nein (No)"));
  fireEvent.click(screen.getByRole("button", { name: "CONFIRM" }));
  return ws.lastCommand(WSCommandType.REGISTER_VOTE);
}

beforeEach(() => {
  jest.useFakeTimers();
  FakeWebSocket.instances = [];
  (global as any).WebSocket = FakeWebSocket;
  (global as any).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, text: () => Promise.resolve("ABCD") })
  );
});

afterEach(() => {
  jest.useRealTimers();
});

test("an action prompt stays up until the action sent from it is acknowledged", async () => {
  const ws = await joinLobby();
  ws.deliver(gameStatePacket());
  runAnimations();
  expect(isVotingPromptShown()).toBe(true);

  const vote = voteNo(ws);
  expect(vote.vote).toBe(false);

  ws.deliver(okPacket(vote[PARAM_REQUEST_ID]));
  runAnimations();
  expect(isVotingPromptShown()).toBe(false);
});

test("an unrelated acknowledgement does not close an action prompt", async () => {
  const ws = await joinLobby();
  ws.deliver(gameStatePacket());
  runAnimations();
  expect(isVotingPromptShown()).toBe(true);

  // The client asks for fresh state whenever the player comes back to the tab.
  // An acknowledgement of anything other than the vote must not be taken for an
  // answer to a vote the player has not cast yet.
  ws.deliver(okPacket(9999));
  runAnimations();
  expect(isVotingPromptShown()).toBe(true);

  // Nothing was sent on the player's behalf.
  expect(ws.lastCommand(WSCommandType.REGISTER_VOTE)).toBeUndefined();
});

test("an action the server never registered is asked for again", async () => {
  const ws = await joinLobby();
  ws.deliver(gameStatePacket());
  runAnimations();

  const vote = voteNo(ws);
  ws.deliver(okPacket(vote[PARAM_REQUEST_ID]));
  runAnimations();
  expect(isVotingPromptShown()).toBe(false);

  // The state comes back with no vote from Alice, so it never arrived. She is
  // asked again rather than being left waiting on a prompt that has gone.
  ws.deliver(gameStatePacket());
  runAnimations();
  expect(isVotingPromptShown()).toBe(true);
});

test("an action the server did register is not asked for again", async () => {
  const ws = await joinLobby();
  ws.deliver(gameStatePacket());
  runAnimations();

  const vote = voteNo(ws);
  ws.deliver(okPacket(vote[PARAM_REQUEST_ID]));
  ws.deliver(gameStatePacket({ userVotes: { [ME]: false } }));
  runAnimations();
  expect(isVotingPromptShown()).toBe(false);
});

test("a player with nothing to do is not prompted", async () => {
  const ws = await joinLobby();
  // Bob is president and it is his nomination to make, not Alice's.
  ws.deliver(
    gameStatePacket({
      state: LobbyState.CHANCELLOR_NOMINATION,
      lastState: LobbyState.SETUP,
      chancellor: "",
    })
  );
  runAnimations();
  expect(screen.queryByText(/Nominate a player/)).not.toBeInTheDocument();
});

/**
 * Delivers a lobby packet listing the given players, with ME first so that this
 * client is the host and sees the start button at all.
 */
function deliverLobby(ws: FakeWebSocket, players: string[]) {
  const icon: Record<string, string> = {};
  // Anything but the default, so the icon picker does not open over the lobby.
  players.forEach((player, i) => (icon[player] = "p" + (i + 1)));
  ws.deliver({
    [PARAM_PACKET_TYPE]: PACKET_LOBBY,
    [PARAM_USERNAMES]: players,
    [PARAM_ICON]: icon,
  });
}

function startGameButton() {
  return screen.getByRole("button", { name: "START GAME" });
}

test("the game cannot be started with fewer than five players", async () => {
  const ws = await joinLobby();
  deliverLobby(ws, [ME, "Bob", "Carol", "Dave"]);

  expect(startGameButton()).toBeDisabled();
  expect(screen.getByText(/Need at least 5 players/)).toBeInTheDocument();
});

test("the game can be started once five players are present", async () => {
  const ws = await joinLobby();
  deliverLobby(ws, PLAYERS);

  expect(startGameButton()).toBeEnabled();
  expect(screen.queryByText(/Need at least 5 players/)).toBeNull();
});

test("a refusal from the server is shown without dropping the connection", async () => {
  const ws = await joinLobby();
  deliverLobby(ws, PLAYERS);

  ws.deliver({
    [PARAM_PACKET_TYPE]: PACKET_ERROR,
    [PARAM_MESSAGE]: "At least 5 players are needed to start a game (4 connected).",
  });

  expect(
    screen.getByText(/At least 5 players are needed to start a game/)
  ).toBeInTheDocument();
  expect(ws.readyState).toBe(FakeWebSocket.OPEN);
});
