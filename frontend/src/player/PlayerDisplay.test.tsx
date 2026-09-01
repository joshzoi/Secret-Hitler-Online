import React from "react";
import { render, screen } from "@testing-library/react";
import PlayerDisplay from "./PlayerDisplay";
import { GameState, LobbyState, Role } from "../types";
import { RoleVisibilityContext } from "../util/RoleVisibilityContext";

/**
 * These cover the Hide Role privacy setting. The property that matters is that a
 * concealed role is absent from the DOM entirely, not merely hidden with CSS --
 * otherwise it would still be readable in devtools.
 */

/**
 * Builds a game state as the server would send it to `viewer`, mirroring
 * GameToJSONConverter.convert: a player is only told another player's role once
 * the game is over, or if they are a Fascist, or Hitler in a game of six or
 * fewer. Everyone else is sent only their own.
 */
const buildGameState = (
  roles: Record<string, Role>,
  viewer: string,
  state: LobbyState = LobbyState.CHANCELLOR_NOMINATION
): GameState => {
  const names = Object.keys(roles);
  const victory =
    state === LobbyState.LIBERAL_VICTORY_POLICY ||
    state === LobbyState.LIBERAL_VICTORY_EXECUTION ||
    state === LobbyState.FASCIST_VICTORY_POLICY ||
    state === LobbyState.FASCIST_VICTORY_ELECTION;
  const showAllRoles =
    victory ||
    roles[viewer] === Role.FASCIST ||
    (roles[viewer] === Role.HITLER && names.length <= 6);

  const players: GameState["players"] = {};
  const avatars: GameState["avatars"] = {};
  names.forEach((name) => {
    players[name] = {
      id: name === viewer || showAllRoles ? roles[name] : undefined,
      alive: true,
      investigated: false,
    };
    avatars[name] = "https://avatars.slack-edge.com/" + name + "_192.png";
  });
  return {
    state,
    lastState: LobbyState.SETUP,
    playerOrder: names,
    players,
    chancellor: "",
    president: names[0],
    lastChancellor: "",
    lastPresident: "",
    electionTracker: 0,
    electionTrackerAdvanced: false,
    userVotes: {},
    liberalPolicies: 0,
    fascistPolicies: 0,
    drawSize: 17,
    discardSize: 0,
    lastPolicy: "",
    vetoOccurred: false,
    avatars,
  };
};

const renderDisplay = (
  gameState: GameState,
  user: string,
  masked: boolean
) =>
  render(
    <RoleVisibilityContext.Provider value={{ masked, setPeeking: () => {} }}>
      <PlayerDisplay gameState={gameState} user={user} />
    </RoleVisibilityContext.Provider>
  );

describe("Hide Role", () => {
  it("shows the user their own role when not hidden", () => {
    const gameState = buildGameState(
      { Alice: Role.LIBERAL, Bob: Role.FASCIST },
      "Alice"
    );
    renderDisplay(gameState, "Alice", false);

    expect(screen.getByText("Liberal")).toBeInTheDocument();
  });

  it("removes the role from the DOM when hidden, not just from view", () => {
    const gameState = buildGameState(
      { Alice: Role.LIBERAL, Bob: Role.FASCIST },
      "Alice"
    );
    const { container } = renderDisplay(gameState, "Alice", true);

    expect(screen.queryByText("Liberal")).not.toBeInTheDocument();
    // The role must not survive anywhere in the markup a snooper could read.
    expect(container.innerHTML).not.toMatch(/liberal/i);
    // ...and a placeholder stands in its place.
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("hides fascist teammates' roles too, not only the user's own", () => {
    // A fascist normally sees every other fascist on the board.
    const gameState = buildGameState(
      { Alice: Role.FASCIST, Bob: Role.FASCIST, Carol: Role.LIBERAL },
      "Alice"
    );

    const visible = renderDisplay(gameState, "Alice", false);
    expect(visible.container.innerHTML).toMatch(/fascist/i);
    visible.unmount();

    const hidden = renderDisplay(gameState, "Alice", true);
    expect(hidden.container.innerHTML).not.toMatch(/fascist/i);
  });

  it("still reveals every role on the victory screen while hidden", () => {
    const gameState = buildGameState(
      { Alice: Role.LIBERAL, Bob: Role.FASCIST },
      "Alice",
      LobbyState.LIBERAL_VICTORY_POLICY
    );
    renderDisplay(gameState, "Alice", true);

    expect(screen.getByText("Liberal")).toBeInTheDocument();
    expect(screen.getByText("Fascist")).toBeInTheDocument();
    expect(screen.queryByText("?")).not.toBeInTheDocument();
  });

  it("does not invent a role for players it was never told about", () => {
    // A liberal is sent no `id` for anyone but themselves.
    const gameState = buildGameState(
      { Alice: Role.LIBERAL, Bob: Role.FASCIST },
      "Alice"
    );
    expect(gameState.players["Bob"].id).toBeUndefined();

    renderDisplay(gameState, "Alice", true);

    // Alice's own role is concealed behind one placeholder; Bob's unknown role
    // must render nothing at all rather than a second placeholder.
    expect(screen.getAllByText("?")).toHaveLength(1);
  });
});
