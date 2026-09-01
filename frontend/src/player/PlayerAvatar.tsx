import React, { useEffect, useState } from "react";
import { fallbackAvatar } from "../assets";

type PlayerAvatarProps = {
  /** The player's Slack profile picture, if they have one. */
  src?: string;
  /** Applied so the existing card layout keeps positioning this. */
  id?: string;
  className?: string;
};

/**
 * A player's picture, with a stand-in for anyone who has none.
 *
 * Slack rotates an avatar URL when someone changes their photo, so a URL held in
 * a lobby since before that will 404. Falling back on error covers it until they
 * reconnect and the server picks up the new one.
 */
export default function PlayerAvatar({ src, id, className }: PlayerAvatarProps) {
  const [failed, setFailed] = useState(false);
  // A new player in this slot deserves a fresh attempt at loading their picture.
  useEffect(() => setFailed(false), [src]);

  return (
    <img
      id={id}
      className={className}
      src={!src || failed ? fallbackAvatar : src}
      onError={() => setFailed(true)}
      /* The card image already carries the player's name and role for a screen
         reader, and the name is written across the card, so describing the
         picture as well would announce every player twice. */
      alt=""
      aria-hidden={true}
      draggable={false}
      /* Slack's CDN has no reason to know which game we are; sending no referrer
         costs nothing here. Note we deliberately do not set crossOrigin, which
         would turn an ordinary image load into a CORS-checked one that
         avatars.slack-edge.com makes no promise to satisfy. */
      referrerPolicy="no-referrer"
    />
  );
}
