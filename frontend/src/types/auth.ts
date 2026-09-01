/** Who the player is, according to the Slack account they signed in with. */
export type SessionUser = {
  /** Stable across name changes; what a seat really belongs to. */
  slackUserId: string;
  /** The name the server derived from their Slack profile. */
  name: string;
  /** Their Slack profile picture, absent if they have not set one. */
  avatar?: string;
};

/**
 * Whether we know who the player is yet. Deliberately separate from PAGE, which
 * says which of the three game screens is showing and is driven by the server.
 */
export type AuthStatus = "checking" | "signed-in" | "signed-out";

/** A game somebody could join, as listed on the home screen. */
export type OpenLobby = {
  code: string;
  playerCount: number;
  maxPlayers: number;
  minPlayers: number;
  inGame: boolean;
  players: { name: string; avatar?: string }[];
};
