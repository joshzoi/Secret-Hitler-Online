import React from "react";
import "./SignInPage.css";
import { slackMark } from "../assets";
import { AUTH_LOGIN, SERVER_ADDRESS_HTTP, SLACK_SIGNIN_URL } from "../constants";
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

        {!props.unreachable && (
          /* Signing in is one tap for somebody already signed in to Slack in
             this browser, and a whole login for somebody who is not. Opens in a
             new tab so a half-finished game invite is not thrown away. */
          <p id={"signin-secondary"}>
            Not signed in to Slack in this browser?{" "}
            <a
              href={SLACK_SIGNIN_URL}
              target={"_blank"}
              rel={"noopener noreferrer"}
            >
              Sign in to Slack first
            </a>
            , then come back here.
          </p>
        )}
      </div>
      <LoginPageContent />
    </div>
  );
}
