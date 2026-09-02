package game;

import game.datastructures.Player;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static junit.framework.TestCase.*;

public class testSecretHitlerGame {

    private ArrayList<String> makePlayers(int numPlayers) {
        ArrayList<String> out = new ArrayList<>();
        for (int i = 0; i < numPlayers; i++) {
            out.add(Integer.toString(i));
        }
        return out;
    }

    @Test
    public void testGameFlow() {
        SecretHitlerGame game = new SecretHitlerGame(makePlayers(6));

        assertEquals(game.getCurrentPresident(), "0");
        assertNull(game.getCurrentChancellor());
        assertEquals(game.getDrawSize(), SecretHitlerGame.NUM_FASCIST_POLICIES + SecretHitlerGame.NUM_LIBERAL_POLICIES);

        List<Player> playerList = game.getPlayerList();
        int fascistCount = 0;
        int liberalCount = 0;
        int hitlerCount = 0;
        for (Player player : playerList) {
            if (player.isHitler()) {
                hitlerCount++;
            } else if (player.isFascist()) {
                fascistCount++;
            } else {
                liberalCount++;
            }
            assertTrue(player.isAlive());
        }
        assertEquals(fascistCount, SecretHitlerGame.NUM_FASCISTS_FOR_PLAYERS[6]);
        assertEquals(hitlerCount, 1);
        assertEquals(liberalCount, playerList.size() - SecretHitlerGame.NUM_FASCISTS_FOR_PLAYERS[6] - 1);

        game.nominateChancellor("2");
        assertEquals(game.getState(), GameState.CHANCELLOR_VOTING);
    }

    /**
     * Plays a 6-player game up to the point where the president has nothing left
     * to do. The first policy of a 6-player game activates no presidential
     * power, whichever party it belongs to, so this always lands in
     * POST_LEGISLATIVE.
     */
    private SecretHitlerGame gameAtEndOfFirstTerm() {
        SecretHitlerGame game = new SecretHitlerGame(makePlayers(6));
        game.nominateChancellor("2");
        for (int i = 0; i < 6; i++) {
            game.registerVote(Integer.toString(i), true);
        }
        game.presidentDiscardPolicy(0);
        game.chancellorEnactPolicy(0);
        return game;
    }

    /**
     * A term with nothing left in it is the one the server ends by itself, so
     * the round has to actually finish there rather than somewhere else.
     */
    @Test
    public void testFirstTermEndsInPostLegislative() {
        SecretHitlerGame game = gameAtEndOfFirstTerm();

        assertEquals(GameState.POST_LEGISLATIVE, game.getState());
        assertEquals("0", game.getCurrentPresident());
        assertEquals(1, game.getRound());
    }

    @Test
    public void testEndingTheTermPassesThePresidencyOn() {
        SecretHitlerGame game = gameAtEndOfFirstTerm();

        game.endPresidentialTerm();

        assertEquals(GameState.CHANCELLOR_NOMINATION, game.getState());
        assertEquals("1", game.getCurrentPresident());
        assertNull(game.getCurrentChancellor());
        assertEquals(2, game.getRound());
    }

    /**
     * The server checks the state before ending a term, because asking to end one
     * mid-round throws -- and an exception in the websocket handler hangs up on
     * the player who sent the message.
     */
    @Test
    public void testATermCannotBeEndedMidRound() {
        SecretHitlerGame game = new SecretHitlerGame(makePlayers(6));

        try {
            game.endPresidentialTerm();
            fail("Ending a term during chancellor nomination should throw.");
        } catch (IllegalStateException expected) {
            // The state guard did its job.
        }

        assertEquals(GameState.CHANCELLOR_NOMINATION, game.getState());
        assertEquals("0", game.getCurrentPresident());
    }
}
