package server.util;

import org.junit.Test;

import static junit.framework.TestCase.*;

public class testLobby {

    /**
     * The server asks every lobby to end a finished term after each command it
     * handles, including the commands that arrive between games. A lobby with no
     * game has no term to end, and must not fall over being asked.
     * <p>
     * This is not hypothetical: the command that wins a game clears the game out
     * of the lobby ({@code updateAllUsers}), and the check runs straight after.
     */
    @Test
    public void endingAFinishedTermDoesNothingOutsideAGame() {
        Lobby lobby = new Lobby();
        assertFalse(lobby.isInGame());

        lobby.endFinishedTerm();

        assertFalse(lobby.isInGame());
    }
}
