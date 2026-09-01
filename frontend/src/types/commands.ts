// TODO: Change these all to camelCase
export const enum WSCommandType {
  PING = "ping",
  START_GAME = "start-game",
  GET_STATE = "get-state",
  REGISTER_CHANCELLOR_VETO = "chancellor-veto",
  REGISTER_PRESIDENT_VETO = "president-veto",
  REGISTER_PEEK = "register-peek",
  END_TERM = "end-term",
  // Leave the lobby on purpose, so the seat is freed rather than held open for
  // a reconnect that is not coming.
  LEAVE_LOBBY = "leave-lobby",
  // Select a player
  NOMINATE_CHANCELLOR = "nominate-chancellor",
  REGISTER_EXECUTION = "register-execution",
  REGISTER_SPECIAL_ELECTION = "register-special-election",
  GET_INVESTIGATION = "get-investigation",
  // Voting action
  REGISTER_VOTE = "register-vote",
  // Policy action
  REGISTER_CHANCELLOR_CHOICE = "register-chancellor-choice",
  REGISTER_PRESIDENT_CHOICE = "register-president-choice",
}

/** All possible commands and associated parameters. */
export type ServerRequestPayload =
  | { command: WSCommandType.PING }
  | { command: WSCommandType.START_GAME }
  | { command: WSCommandType.GET_STATE }
  | { command: WSCommandType.REGISTER_CHANCELLOR_VETO }
  | { command: WSCommandType.REGISTER_PRESIDENT_VETO; veto: boolean }
  | { command: WSCommandType.REGISTER_PEEK }
  | { command: WSCommandType.END_TERM }
  | { command: WSCommandType.LEAVE_LOBBY }
  | { command: WSCommandType.NOMINATE_CHANCELLOR; target: string }
  | { command: WSCommandType.REGISTER_EXECUTION; target: string }
  | { command: WSCommandType.REGISTER_SPECIAL_ELECTION; target: string }
  | { command: WSCommandType.GET_INVESTIGATION; target: string }
  | { command: WSCommandType.REGISTER_VOTE; vote: boolean }
  | { command: WSCommandType.REGISTER_CHANCELLOR_CHOICE; choice: number }
  | { command: WSCommandType.REGISTER_PRESIDENT_CHOICE; choice: number };

export type SendWSCommand = (payload: ServerRequestPayload) => void;

/**
 * A WebSocket command to send to the server.
 * @param {WSCommandType} command The command type.
 * @param {string} lobby The lobby to send the command to.
 *
 * Optional, depending on command:
 * @param {string} target The target of the command. Used for powers and nominations.
 * @param {boolean} vote The vote to register.
 * @param {number} choice The policy index to register.
 */
export type WSCommand = {
  /* Which lobby this is for. The player's identity is not sent: the server takes
     it from the connection, which was authenticated when it was opened. */
  lobby: string;
  /* Identifies this command. The server echoes it in the 'ok' it sends back, so
     the client can tell which command that 'ok' is answering. */
  "request-id": number;
} & ServerRequestPayload;
