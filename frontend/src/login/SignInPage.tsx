import React from "react";
import "./SignInPage.css";
import { slackMark } from "../assets";
import { AUTH_LOGIN, SERVER_ADDRESS_HTTP } from "../constants";
import LoginPageContent from "../LoginPageContent";

type SignInPageProps = {
  /** Why the last attempt failed, if there was one. */
  authError: string;
  /** True when we could not reach the server at all, rather than being refused. */
  unreachable: boolean;
  /** A lobby the player was invited to, waiting for them to sign in. */
  pendingLobby?: string;
  onRetry: () => void;
};

export default function SignInPage(props: SignInPageProps) {
  return (
    <div className="App">
      <header className="App-header">Secret Hitler</header>
      <br />
      <div style={{ textAlign: "center" }}>
        <p id={"signin-explainer"}>
          Sign in with Slack to play. Your name and picture come from your
          profile, so everyone can tell who is who.
        </p>
        {props.pendingLobby && (
          <p id={"signin-invite"}>
            You have been invited to game {props.pendingLobby}.
          </p>
        )}
        {props.authError !== "" && <p id={"errormessage"}>{props.authError}</p>}

        {props.unreachable ? (
          <button onClick={props.onRetry}>RETRY</button>
        ) : (
          /* A link rather than a button with a fetch: this is a navigation away
             to Slack, and a fetch would follow the redirect and fail on CORS. */
          <a
            className={"slack-signin-button"}
            href={SERVER_ADDRESS_HTTP + AUTH_LOGIN}
            rel={"nofollow"}
          >
            <img className={"slack-signin-mark"} src={slackMark} alt="" />
            Sign in with Slack
          </a>
        )}
      </div>
      <LoginPageContent />
    </div>
  );
}
