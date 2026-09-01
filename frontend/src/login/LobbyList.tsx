import React, { useCallback, useEffect, useRef, useState } from "react";
import "./LobbyList.css";
import { OpenLobby } from "../types/auth";
import { listOpenLobbies, SessionExpiredError } from "../util/api";
import { fallbackAvatar } from "../assets";

/* Often enough that the list feels live while people are gathering, which is the
   only time anyone looks at it. */
const POLL_INTERVAL_MS = 5000;
/* Enough to recognise the table without the row wrapping on a phone. */
const MAX_AVATARS_SHOWN = 4;

type LobbyListProps = {
  onJoin: (code: string) => void;
  /** True while a join or create is already under way. */
  disabled: boolean;
  onSessionExpired: () => void;
};

export default function LobbyList(props: LobbyListProps) {
  const [lobbies, setLobbies] = useState<OpenLobby[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef<AbortController | undefined>(undefined);

  const { onSessionExpired } = props;

  const refresh = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const open = await listOpenLobbies(controller.signal);
      if (!controller.signal.aborted) {
        setLobbies(open);
        setFailed(false);
      }
    } catch (e) {
      if (controller.signal.aborted) {
        return;
      }
      if (e instanceof SessionExpiredError) {
        onSessionExpired();
        return;
      }
      setFailed(true);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      // A backgrounded tab has its timers throttled anyway, and nobody is looking
      // at a list they cannot see.
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      inFlight.current?.abort();
    };
  }, [refresh]);

  const renderRow = (lobby: OpenLobby) => {
    const shown = lobby.players.slice(0, MAX_AVATARS_SHOWN);
    const hidden = lobby.players.length - shown.length;
    return (
      <div className={"lobby-list-row"} key={lobby.code}>
        <span className={"lobby-list-code"}>{lobby.code}</span>
        <span className={"lobby-list-count"}>
          {lobby.playerCount}/{lobby.maxPlayers}
        </span>
        <span className={"lobby-list-avatars"}>
          {shown.map((player) => (
            <img
              key={player.name}
              className={"lobby-list-avatar"}
              src={player.avatar || fallbackAvatar}
              alt={player.name}
              title={player.name}
              referrerPolicy={"no-referrer"}
            />
          ))}
          {hidden > 0 && <span className={"lobby-list-more"}>+{hidden}</span>}
        </span>
        <button
          className={"lobby-list-button"}
          onClick={() => props.onJoin(lobby.code)}
          disabled={props.disabled}
        >
          JOIN
        </button>
      </div>
    );
  };

  let body;
  if (failed) {
    // Never stops the player joining by code or creating their own; the list is
    // a convenience, not the way in.
    body = (
      <p id={"lobby-list-status"}>
        Couldn&apos;t load the list of games.
        <br />
        <button className={"lobby-list-button"} onClick={refresh}>
          RETRY
        </button>
      </p>
    );
  } else if (lobbies === undefined) {
    body = <p id={"lobby-list-status"}>Loading games&hellip;</p>;
  } else if (lobbies.length === 0) {
    body = <p id={"lobby-list-status"}>No games right now.</p>;
  } else {
    body = lobbies.map(renderRow);
  }

  return (
    <div id={"lobby-list"}>
      <h2>OPEN GAMES</h2>
      {body}
      {!failed && lobbies !== undefined && (
        <button className={"lobby-list-button"} onClick={refresh}>
          REFRESH
        </button>
      )}
    </div>
  );
}
