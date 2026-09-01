import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

// Analytics is not what this is testing, and react-ga's initialize looks for a
// script tag to insert itself before, which a bare test page does not have.
jest.mock("react-ga");

/** Answers /auth/me the way a signed-out browser would. */
function signedOut() {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ signedIn: false }),
      text: () => Promise.resolve(""),
    })
  );
}

/** Answers /auth/me as a signed-in player, and the lobby list as empty. */
function signedIn() {
  global.fetch = jest.fn((url) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          String(url).includes("/auth/me")
            ? { signedIn: true, slackUserId: "U_ALICE", name: "Alice" }
            : { lobbies: [] }
        ),
      text: () => Promise.resolve(""),
    })
  );
}

test("asks a signed-out visitor to sign in with Slack", async () => {
  signedOut();
  render(<App />);

  expect(
    await screen.findByRole("link", { name: /Sign in with Slack/i })
  ).toBeInTheDocument();
  // No way in but Slack: the old name and lobby fields are gone.
  expect(screen.queryByRole("button", { name: "JOIN" })).toBeNull();
});

test("offers a way to sign in to Slack first, in a new tab", async () => {
  signedOut();
  render(<App />);

  const link = await screen.findByRole("link", { name: /Sign in to Slack first/i });
  expect(link).toHaveAttribute("href", expect.stringContaining("slack.com"));
  // A new tab, so a player following a game invite does not lose it.
  expect(link).toHaveAttribute("target", "_blank");
  // Slack must not be handed a window.opener back into the game.
  expect(link.getAttribute("rel")).toContain("noopener");
});

test("shows the signed-in player who they are, and how to play", async () => {
  signedIn();
  await act(async () => {
    render(<App />);
  });

  await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "CREATE LOBBY" })).toBeEnabled();
  expect(
    screen.queryByRole("link", { name: /Sign in with Slack/i })
  ).toBeNull();
});

test("cannot join by code until a whole code is entered", async () => {
  signedIn();
  await act(async () => {
    render(<App />);
  });

  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "JOIN" })[0]).toBeDisabled()
  );
});
