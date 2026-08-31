import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Analytics is not what this is testing, and react-ga's initialize looks for a
// script tag to insert itself before, which a bare test page does not have.
jest.mock("react-ga");

test("opens on the login page", () => {
  render(<App />);

  expect(screen.getByText("JOIN A GAME")).toBeInTheDocument();
  expect(screen.getByText("CREATE A LOBBY")).toBeInTheDocument();
});

test("cannot join or create a lobby until the fields are filled in", () => {
  render(<App />);

  expect(screen.getByRole("button", { name: "JOIN" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "CREATE LOBBY" })).toBeDisabled();
});
