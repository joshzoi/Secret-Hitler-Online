import React from "react";

/**
 * Controls whether role information is concealed on this device.
 *
 * This is a privacy feature for playing in the same room: it stops someone
 * glancing at a neighbour's phone from learning their team. It is not an
 * anti-cheat measure -- the role is still present in the websocket payload and
 * in App's state, so a player can always inspect their own client.
 *
 * Passed via context rather than props because alerts are pre-built JSX stored
 * in App's state: their props are snapshotted when the alert is queued, so a
 * prop would go stale as soon as the toggle changed. Context updates still
 * reach consumers when a parent bails out of re-rendering an unchanged
 * element, which is exactly the case here.
 */
export type RoleVisibility = {
  /** True when role information should be concealed right now. */
  masked: boolean;
};

export const RoleVisibilityContext = React.createContext<RoleVisibility>({
  masked: false,
});
