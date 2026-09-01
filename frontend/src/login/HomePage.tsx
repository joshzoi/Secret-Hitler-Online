import React from "react";
import "./HomePage.css";
import LobbyList from "./LobbyList";
import LoginPageContent from "../LoginPageContent";
import MaxLengthTextField from "../util/MaxLengthTextField";
import { LOBBY_CODE_LENGTH } from "../constants";
import { SessionUser } from "../types/auth";
import { fallbackAvatar } from "../assets";

type HomePageProps = {
  session: SessionUser;
  lobbyCode: string;
  onLobbyCodeChange: (text: string) => void;
  onJoin: (code: string) => void;
  onCreate: () => void;
  onSignOut: () => void;
  onSessionExpired: () => void;
  joinError: string;
  createError: string;
  /** True while a join or create is already under way. */
  busy: boolean;
};

export default function HomePage(props: HomePageProps) {
  return (
    <div className="App">
      <header className="App-header">Secret Hitler</header>

      <div id={"home-session"}>
        <img
          id={"home-session-avatar"}
          src={props.session.avatar || fallbackAvatar}
          alt=""
          referrerPolicy={"no-referrer"}
        />
        <span>
          Signed in as <b>{props.session.name}</b>
        </span>
        <button id={"home-signout"} onClick={props.onSignOut}>
          Sign out
        </button>
      </div>

      <LobbyList
        onJoin={props.onJoin}
        disabled={props.busy}
        onSessionExpired={props.onSessionExpired}
      />

      <div style={{ textAlign: "center" }}>
        <h2>JOIN WITH A CODE</h2>
        <MaxLengthTextField
          label={"Lobby"}
          onChange={props.onLobbyCodeChange}
          value={props.lobbyCode}
          maxLength={LOBBY_CODE_LENGTH}
          showCharCount={false}
          forceUpperCase={true}
        />
        <p id={"errormessage"}>{props.joinError}</p>
        <button
          onClick={() => props.onJoin(props.lobbyCode)}
          disabled={props.busy || props.lobbyCode.length !== LOBBY_CODE_LENGTH}
        >
          JOIN
        </button>
      </div>

      <div>
        <h2>CREATE A LOBBY</h2>
        <p id={"errormessage"}>{props.createError}</p>
        <button onClick={props.onCreate} disabled={props.busy}>
          CREATE LOBBY
        </button>
      </div>
      <LoginPageContent />
    </div>
  );
}
