import p_default from "./player-portraits/player-portrait-default.svg";
import badge_img from "./badge.svg";
import slack_mark from "./slack-mark.svg";

/**
 * Shown for a player with no Slack profile picture. The other twenty portraits
 * went with the icon picker: players are recognised by their real photo now,
 * which is the whole point of signing in.
 */
export const fallbackAvatar: string = p_default;

export const badge = badge_img;

/** Slack's own mark, for the sign-in button. Bundled rather than hotlinked. */
export const slackMark: string = slack_mark;
