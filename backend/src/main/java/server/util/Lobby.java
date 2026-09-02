package server.util;

import game.GameState;
import game.SecretHitlerGame;
import io.javalin.websocket.WsContext;
import org.eclipse.jetty.websocket.api.StatusCode;
import org.json.JSONArray;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import server.SecretHitlerServer;
import server.auth.UserSession;

import java.io.IOException;
import java.io.Serializable;
import java.util.*;
import java.util.Map.Entry;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ConcurrentSkipListSet;
import java.util.stream.Collectors;

/**
 * A Lobby holds a collection of websocket connections, each representing a
 * player.
 * It maintains the game that the connections are associated with.
 *
 * A user is defined as an active websocket connection.
 */
public class Lobby implements Serializable {

    /* Bumped when seats stopped being owned by a browser-generated id and started
     * being owned by a Slack account. A snapshot written before that has names in it
     * that nobody can now prove they own, so a game restored from one would be
     * unjoinable by the people playing it. Refusing it outright loses the same games
     * and says so in the log. */
    private static final long serialVersionUID = 2L;

    /* Reasons a connection can be turned away. These are sent to the client as
     * the websocket close reason so it can tell a temporary network blip (worth
     * retrying) apart from a permanent refusal (stop and tell the player). */
    public static final String REJECT_LOBBY_FULL = "lobby-full";
    public static final String REJECT_GAME_IN_PROGRESS = "game-in-progress";

    /* Sent to a connection that has been superseded by a newer one from the same
     * browser. That client must not reconnect, or the two sockets fight forever. */
    public static final String CLOSE_REPLACED = "replaced";

    private SecretHitlerGame game;

    // These two marked transient because they track currently active/connected
    // users.
    transient private ConcurrentHashMap<WsContext, String> userToUsername;
    transient private Queue<String> activeUsernames;

    final private Set<String> usersInGame;

    /* Who holds each seat, by Slack account. Unlike the browser-generated id this
     * replaced, it is something the player proved rather than something they
     * asserted, so it survives closing the tab and cannot be borrowed by anyone who
     * learns it. Persisted, so seats outlive a restart.
     *
     * Not final: a field absent from an older snapshot can only be filled in by
     * readObject, which cannot assign a final one. */
    private ConcurrentHashMap<String, String> usernameToSlackUserId;

    /* The reverse of usernameToSlackUserId, so a returning player can be found by
     * who they are rather than by what they were called. Derived on load rather than
     * stored: two copies of the same mapping can disagree, and only one of them can
     * be right. */
    transient private ConcurrentHashMap<String, String> slackUserIdToUsername;

    /* Each player's Slack profile picture. Kept here rather than looked up from
     * their session on every broadcast: bots aside, a dropped player's row is still
     * drawn while their seat is held, and an executed player's forever, by which
     * time their session may be long gone. */
    private ConcurrentHashMap<String, String> usernameToAvatarUrl;

    public static long LOBBY_TIMEOUT_DURATION_IN_MIN = 10;
    /* How long a seat is held for a player whose connection dropped. Long enough to
     * cover a phone locking or the player switching apps. */
    public static float PLAYER_TIMEOUT_IN_SEC = 20;
    private long timeout;

    private static Logger logger = LoggerFactory.getLogger(Lobby.class);

    private static int MAX_TIMER_SCHEDULING_ATTEMPTS = 2;
    transient private Timer userTimeoutTimer = new Timer();

    /**
     * Constructs a new Lobby.
     */
    public Lobby() {
        userToUsername = new ConcurrentHashMap<WsContext, String>();
        activeUsernames = new ConcurrentLinkedQueue<>();
        usersInGame = new ConcurrentSkipListSet<>();
        usernameToSlackUserId = new ConcurrentHashMap<>();
        slackUserIdToUsername = new ConcurrentHashMap<>();
        usernameToAvatarUrl = new ConcurrentHashMap<>();
        resetTimeout();
    }

    /**
     * Resets the internal timeout for this lobby.
     * 
     * @effects The lobby will time out in {@code TIMEOUT_DURATION_MS} ms from now.
     */
    synchronized public void resetTimeout() {
        // The timeout duration for the server. (currently 30 minutes)
        long MS_PER_MINUTE = 1000 * 60;
        timeout = System.currentTimeMillis() + MS_PER_MINUTE * LOBBY_TIMEOUT_DURATION_IN_MIN;
    }

    /**
     * Returns whether the lobby has timed out.
     * 
     * @return true if the Lobby has timed out.
     */
    synchronized public boolean hasTimedOut() {
        return timeout <= System.currentTimeMillis();
    }

    /**
     * Returns the set of websocket connections connected to this Lobby.
     * 
     * @return a set of WsContexts, where each context is a user connected to the
     *         Lobby.
     */
    synchronized public Set<WsContext> getConnections() {
        return userToUsername.keySet();
    }

    /**
     * Returns the list of usernames currently in the lobby or game.
     */
    synchronized public List<String> getUserNames() {
        if (game != null) {
            return game.getPlayerList().stream().map(player -> player.getUsername()).collect(Collectors.toList());
        } else {
            return new ArrayList<String>(userToUsername.values());
        }
    }

    /////// User Management
    // <editor-fold desc="User Management">

    /**
     * Returns whether the given user (websocket connection) is in this lobby
     * 
     * @param context the Websocket context of a user.
     * @return true iff the {@code context} is in this lobby.
     */
    synchronized public boolean hasUser(WsContext context) {
        return userToUsername.containsKey(context);
    }

    /**
     * Returns whether a user with the given name exists in this lobby.
     * 
     * @param context the Websocket context of the user.
     * @param name    the name of the user.
     * @return true iff {@code context} is a user in the lobby with the name
     *         {@code name}.
     */
    synchronized public boolean hasUser(WsContext context, String name) {
        return userToUsername.containsKey(context) && userToUsername.get(context).equals(name);
    }

    /**
     * The name the player behind a connection is playing under.
     *
     * @param context the websocket connection.
     * @return their username, or null if the connection is not in this lobby.
     */
    synchronized public String usernameFor(WsContext context) {
        return userToUsername.get(context);
    }

    /**
     * Returns true if the lobby has a user with a given username.
     * 
     * @param name the username to check the Lobby for.
     * @return true iff the username {@code name} is in this lobby.
     */
    synchronized public boolean hasUserWithName(String name) {
        return userToUsername.values().contains(name);
    }

    /**
     * Drops any connections whose session has already been closed.
     *
     * @modifies this
     * @effects removes from the lobby every connection that is no longer open. A
     *          socket that dies without a close handshake (a phone going to sleep,
     *          a laptop changing networks) otherwise sits in the map holding a
     *          username hostage until Jetty's idle timeout notices.
     */
    synchronized private void pruneDeadConnections() {
        Iterator<Entry<WsContext, String>> itr = userToUsername.entrySet().iterator();
        while (itr.hasNext()) {
            Entry<WsContext, String> entry = itr.next();
            if (!entry.getKey().session.isOpen()) {
                logger.debug("Pruning the dead connection of '" + entry.getValue() + "'.");
                itr.remove();
            }
        }
    }

    /**
     * The seat held by a Slack account, whatever it happens to be called.
     *
     * @param slackUserId the account to look for.
     * @return the username of their seat, or null if they do not hold one here.
     */
    synchronized public String seatFor(String slackUserId) {
        if (slackUserId == null || slackUserId.isEmpty()) {
            return null;
        }
        return slackUserIdToUsername.get(slackUserId);
    }

    /**
     * Forgets a seat and everything attached to it.
     *
     * @param username the seat to free.
     * @modifies this
     * @effects the name is available again and the player who held it is no longer
     *          recognised as its owner.
     */
    synchronized private void releaseSeat(String username) {
        activeUsernames.remove(username);
        String slackUserId = usernameToSlackUserId.remove(username);
        if (slackUserId != null) {
            slackUserIdToUsername.remove(slackUserId);
        }
        usernameToAvatarUrl.remove(username);
    }

    /** Every name spoken for, including seats held open for absent players. */
    synchronized public Set<String> takenNames() {
        Set<String> taken = new java.util.HashSet<>();
        taken.addAll(activeUsernames);
        taken.addAll(usersInGame);
        taken.addAll(usernameToSlackUserId.keySet());
        taken.addAll(userToUsername.values());
        return taken;
    }

    /**
     * Thrown when a game cannot be started yet, for a reason the player can do
     * something about -- too few players, or a game already running.
     * <p>
     * Distinct from the RuntimeExceptions the command handler treats as protocol
     * violations: those hang up on the client, which would throw the host out of
     * their own lobby for asking too early.
     */
    public static class StartRefusedException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public StartRefusedException(String message) {
            super(message);
        }
    }

    /**
     * The verdict on a connection request: whether it may join, and if not, why.
     */
    public static class JoinDecision {
        private final boolean allowed;
        private final boolean reclaim;
        private final String username;
        private final String reason;
        private final String message;

        private JoinDecision(boolean allowed, boolean reclaim, String username, String reason, String message) {
            this.allowed = allowed;
            this.reclaim = reclaim;
            this.username = username;
            this.reason = reason;
            this.message = message;
        }

        static JoinDecision allow(boolean reclaim, String username) {
            return new JoinDecision(true, reclaim, username, null, null);
        }

        static JoinDecision reject(String reason, String message) {
            return new JoinDecision(false, false, null, reason, message);
        }

        public boolean isAllowed() {
            return allowed;
        }

        /**
         * The name this player will be known by in this lobby. Chosen by the server
         * from their Slack profile, not asked for by the client.
         */
        public String getUsername() {
            return username;
        }

        /** True if this connection is taking back a seat it already held. */
        public boolean isReclaim() {
            return reclaim;
        }

        /** A short machine-readable reason for a refusal, or null if allowed. */
        public String getReason() {
            return reason;
        }

        /** A human-readable explanation of a refusal, or null if allowed. */
        public String getMessage() {
            return message;
        }
    }

    /**
     * Decides whether a signed-in player may join, and what they will be called.
     *
     * @param session the player's Slack session.
     * @modifies this
     * @effects prunes any connections that have already died, then returns the
     *          verdict. A player who already holds a seat here always gets it back,
     *          whatever it is named and whether or not the server has noticed their
     *          old connection is gone.
     */
    synchronized public JoinDecision evaluateJoin(UserSession session) {
        pruneDeadConnections();

        // Their seat is theirs. Looking it up by account rather than by name covers
        // three things that used to be separate cases: a reconnect racing the server
        // noticing the old socket died, a seat still being held after a drop, and
        // rejoining a game already in progress.
        String existing = seatFor(session.getSlackUserId());
        if (existing != null) {
            if (isInGame() && !usersInGame.contains(existing)) {
                // They were in the lobby but not dealt into the game that started.
                return JoinDecision.reject(REJECT_GAME_IN_PROGRESS, "The lobby is currently in a game.");
            }
            return JoinDecision.allow(true, existing);
        }

        if (isInGame()) {
            return JoinDecision.reject(REJECT_GAME_IN_PROGRESS, "The lobby is currently in a game.");
        }
        if (isFull()) {
            return JoinDecision.reject(REJECT_LOBBY_FULL, "The lobby is currently full.");
        }
        return JoinDecision.allow(false, DisplayNames.uniqueNameFor(session.getProfile(), takenNames()));
    }

    /**
     * Closes and forgets every connection currently playing as {@code name}.
     * 
     * @param name the username whose connections should be dropped.
     * @modifies this
     * @effects removes the connections from the lobby and closes them with the
     *          {@code CLOSE_REPLACED} reason, which tells that client not to try to
     *          reconnect.
     */
    synchronized private void evictConnectionsFor(String name) {
        Iterator<Entry<WsContext, String>> itr = userToUsername.entrySet().iterator();
        while (itr.hasNext()) {
            Entry<WsContext, String> entry = itr.next();
            if (!entry.getValue().equals(name)) {
                continue;
            }
            WsContext stale = entry.getKey();
            // Remove it first: closing fires the close handler on another thread,
            // and it must not find this connection still holding the seat.
            itr.remove();
            try {
                stale.session.close(StatusCode.NORMAL, CLOSE_REPLACED);
            } catch (Exception e) {
                logger.debug("Failed to close the replaced connection of '" + name + "'.", e);
            }
        }
    }

    /**
     * Checks whether the lobby is full.
     * 
     * @return Returns true if the number of players in the lobby is {@literal >= }
     *         {@code SecretHitlerGame.MAX_PLAYERS}.
     */
    synchronized public boolean isFull() {
        return activeUsernames.size() >= SecretHitlerGame.MAX_PLAYERS;
    }

    /**
     * Adds a signed-in player's connection to the lobby.
     *
     * @param context the websocket connection context.
     * @param session the player's Slack session.
     * @return the name they joined under.
     * @throws IllegalArgumentException if a duplicate websocket is added, or if
     *                                  {@code evaluateJoin} would have refused this
     *                                  connection.
     * @modifies this
     * @effects adds the player to the lobby, taking the seat back from any
     *          connection still holding it, and records the account that owns it so
     *          they are recognised on a later reconnect.
     */
    synchronized public String addUser(WsContext context, UserSession session) {
        if (userToUsername.containsKey(context)) {
            throw new IllegalArgumentException("Duplicate websockets cannot be added to a lobby.");
        }
        JoinDecision decision = evaluateJoin(session);
        if (!decision.isAllowed()) {
            throw new IllegalArgumentException(decision.getMessage());
        }
        String name = decision.getUsername();

        // Anything still connected under this name has been superseded. With one
        // account to a seat, this is now what happens when someone opens the game in
        // a second tab, rather than only after a socket died unnoticed.
        evictConnectionsFor(name);

        userToUsername.put(context, name);
        if (!activeUsernames.contains(name)) {
            activeUsernames.add(name);
        }
        usernameToSlackUserId.put(name, session.getSlackUserId());
        slackUserIdToUsername.put(session.getSlackUserId(), name);
        // Refreshed on every join, so a changed profile picture catches up by
        // itself, as does an avatar URL Slack has since rotated.
        if (session.getAvatarUrl() != null) {
            usernameToAvatarUrl.put(name, session.getAvatarUrl());
        } else {
            usernameToAvatarUrl.remove(name);
        }
        return name;
    }

    /**
     * Removes a user from the lobby immediately, without holding their seat.
     * 
     * @param context the websocket connection of the player leaving.
     * @modifies this
     * @effects frees the player's seat right away. Used when a player deliberately
     *          leaves, as opposed to dropping off, so the rest of the lobby does not
     *          have to wait out the reconnect grace period before starting.
     */
    synchronized public void removeUserImmediately(WsContext context) {
        if (!hasUser(context)) {
            return;
        }
        releaseSeat(userToUsername.remove(context));
    }

    /**
     * Removes a user from the Lobby.
     * 
     * @param context the websocket connection context of the player to remove.
     * @throws IllegalArgumentException if {@code context} is not a user in the
     *                                  Lobby.
     * @modifies this
     * @effects removes the user context (websocket connection) of the player from
     *          the lobby.
     */
    synchronized public void removeUser(WsContext context) {
        if (!hasUser(context)) {
            throw new IllegalArgumentException("Cannot remove a websocket that is not in the Lobby.");
        } else {
            // Delay removing players from the list by adding it to a timer.
            int delay_in_ms = (int) (PLAYER_TIMEOUT_IN_SEC * 1000);
            final String username = userToUsername.get(context);

            int timerSchedulingAttempts = 0;
            while (timerSchedulingAttempts < MAX_TIMER_SCHEDULING_ATTEMPTS) {
                try {
                    userTimeoutTimer.schedule(new RemoveUserTask(username), delay_in_ms);
                    break; // exit loop if successful
                } catch (IllegalStateException e) {
                    // Timer hit an error state and must be reset.
                    userTimeoutTimer.cancel();
                    userTimeoutTimer = new Timer();
                    timerSchedulingAttempts++;
                }
            }
            if (timerSchedulingAttempts == MAX_TIMER_SCHEDULING_ATTEMPTS) {
                System.out.println("Failed to schedule removal of the user '" + username + "'.");
            }

            userToUsername.remove(context);
        }
    }

    /**
     * Small helper class for removing users from the active users queue.
     */
    class RemoveUserTask extends TimerTask {
        private final String username;

        RemoveUserTask(String username) {
            this.username = username;
        }

        public void run() {
            synchronized (Lobby.this) {
                // If the user reconnected in the meantime, or their seat has already
                // been released, there is nothing to do.
                if (userToUsername.values().contains(username) || !activeUsernames.contains(username)) {
                    return;
                }
                if (isInGame()) {
                    // Mid-game the seat stays theirs for the whole game, so they can
                    // come back to the same role. Only the live connection is dropped.
                    activeUsernames.remove(username);
                } else {
                    releaseSeat(username);
                }
                updateAllUsers();
            }
        }
    }

    /**
     * Returns the number of active users connected to the Lobby.
     * 
     * @return the number of active websocket connections currently in the lobby.
     */
    synchronized public int getUserCount() {
        return activeUsernames.size();
    }

    /**
     * Sends a message to every connected user with the current game state.
     * 
     * @effects a message containing a JSONObject representing the state of the
     *          SecretHitlerGame is sent
     *          to each connected WsContext.
     *          ({@code GameToJSONConverter.convert()})
     */
    synchronized public void updateAllUsers() {
        for (Entry<WsContext, String> entry : new ArrayList<>(userToUsername.entrySet())) {
            updateUser(entry.getKey(), entry.getValue());
        }

        // Check if the game ended.
        if (game != null && game.hasGameFinished()) {
            game = null;
        }
    }

    /**
     * Ends a presidential term that has nothing left in it.
     *
     * @effects if the game is sitting in {@code POST_LEGISLATIVE} -- the
     *          president has enacted their policy and used any power that came
     *          with it -- ends their term and tells everyone. Does nothing
     *          otherwise, so this is safe to call after any command.
     *          <p>
     *          Call this only once the state that is being left has already been
     *          sent out: {@code POST_LEGISLATIVE} is what tells a client to show
     *          the enacted policy and the result of any presidential power, and
     *          those messages name the president who is leaving.
     */
    synchronized public void endFinishedTerm() {
        if (!isInGame() || game.getState() != GameState.POST_LEGISLATIVE) {
            return;
        }
        game.endPresidentialTerm();
        updateAllUsers();
    }

    /**
     * Sends a message to the specified user with the current game state.
     * 
     * @param ctx the WsContext websocket context.
     * @effects a message containing a JSONObject representing the state of the
     *          SecretHitlerGame is sent
     *          to the specified WsContext. ({@code GameToJSONConverter.convert()})
     */
    synchronized public void updateUser(WsContext ctx, String userName) {
        JSONObject message;
        if (isInGame()) {
            message = GameToJSONConverter.convert(game, userName); // sends the game state
            message.put(SecretHitlerServer.PARAM_PACKET_TYPE, SecretHitlerServer.PACKET_GAME_STATE);
        } else {
            message = new JSONObject();
            message.put(SecretHitlerServer.PARAM_PACKET_TYPE, SecretHitlerServer.PACKET_LOBBY);
            message.put("usernames", activeUsernames.toArray());
        }
        // Every player's picture, on both packet types, keyed the same way the
        // player data is.
        message.put("avatars", new JSONObject(usernameToAvatarUrl));
        // Which of those players the recipient is. The client looks itself up in
        // the player data by name, so it cannot be left to infer one that the
        // lobby may have disambiguated.
        message.put("you", userName);

        try {
            ctx.send(message.toString());
        } catch (Exception e) {
            // The socket died between the last check and this send. Drop it here so
            // one player's dead connection cannot stop everyone else being updated;
            // the close handler tidies up the rest.
            logger.debug("Failed to send an update to '" + userName + "'; dropping the connection.", e);
            userToUsername.remove(ctx);
        }
    }

    /**
     * Called when an object is deserialized (see Serializable in Java docs).
     * Initializes the userToUsername and activeUsernames, as they are transient
     * objects and not saved during
     * serialization of Lobby.
     * 
     * @param in the Object Input Stream that is reading in the object.
     * @throws IOException
     * @throws ClassNotFoundException
     */
    private void readObject(java.io.ObjectInputStream in) throws IOException, ClassNotFoundException {
        in.defaultReadObject();
        userToUsername = new ConcurrentHashMap<>();
        activeUsernames = new ConcurrentLinkedQueue<>();
        userTimeoutTimer = new Timer();
        // A field the class has but the stream does not is left null: defaultReadObject
        // runs neither the constructor nor the field initialisers.
        if (usernameToSlackUserId == null) {
            usernameToSlackUserId = new ConcurrentHashMap<>();
        }
        if (usernameToAvatarUrl == null) {
            usernameToAvatarUrl = new ConcurrentHashMap<>();
        }
        // Always derived, never stored, so it cannot drift out of step with the
        // mapping it is the reverse of.
        slackUserIdToUsername = new ConcurrentHashMap<>();
        for (Entry<String, String> entry : usernameToSlackUserId.entrySet()) {
            slackUserIdToUsername.put(entry.getValue(), entry.getKey());
        }
    }

    // </editor-fold>

    ////// Game Management
    // <editor-fold desc="Game Management">

    /**
     * Returns whether the Lobby is currently in a game.
     * 
     * @return true iff the Lobby has a currently active game.
     */
    synchronized public boolean isInGame() {
        return game != null;
    }

    /**
     * Starts a new SecretHitlerGame with the connected users as players.
     * 
     * @throws StartRefusedException if there are too few or too many connected
     *                               players, or if the lobby is already in a game
     *                               ({@code isInGame() == true}).
     * @modifies this
     * @effects creates and stores a new SecretHitlerGame.
     *          The usernames of all active users are added to the game in a
     *          randomized order.
     */
    synchronized public void startNewGame() {
        pruneDeadConnections();

        // Only players who are actually connected are dealt in. A seat is held open
        // for a while after a player drops, so that a player who has really gone is
        // not dealt a role that nobody is there to play.
        List<String> humanPlayers = new ArrayList<>();
        for (String username : activeUsernames) {
            if (hasUserWithName(username)) {
                humanPlayers.add(username);
            }
        }

        if (isInGame()) {
            throw new StartRefusedException("The lobby is already in a game.");
        }
        // Every seat now belongs to a real player, so a short lobby cannot be padded
        // out. The host's client hides the button below the minimum, but a player can
        // drop between them seeing enough players and clicking, so it is checked here
        // as well -- and refused without hanging up on them.
        if (humanPlayers.size() < SecretHitlerGame.MIN_PLAYERS) {
            throw new StartRefusedException("At least " + SecretHitlerGame.MIN_PLAYERS
                    + " players are needed to start a game (" + humanPlayers.size() + " connected).");
        }
        if (humanPlayers.size() > SecretHitlerGame.MAX_PLAYERS) {
            throw new StartRefusedException("At most " + SecretHitlerGame.MAX_PLAYERS
                    + " players can play a game (" + humanPlayers.size() + " connected).");
        }

        usersInGame.clear();
        usersInGame.addAll(humanPlayers);

        // Drop any seats still being held for players who did not make the roster.
        activeUsernames.retainAll(humanPlayers);

        // Initialize the new game
        List<String> playerNames = new ArrayList<>(humanPlayers);
        Collections.shuffle(playerNames);

        game = new SecretHitlerGame(playerNames);
    }

    /**
     * Describes this lobby for the list of games open to join.
     *
     * Only what the browser needs to show a row and decide whether to offer it:
     * names and pictures, which everyone signed in can already see by joining, and
     * never roles, votes, or anything about who is who.
     *
     * @param code the lobby code, which the server holds rather than the lobby.
     * @return the summary.
     */
    synchronized public JSONObject toSummaryJson(String code) {
        JSONObject out = new JSONObject();
        out.put("code", code);
        out.put("playerCount", getUserCount());
        out.put("maxPlayers", SecretHitlerGame.MAX_PLAYERS);
        out.put("minPlayers", SecretHitlerGame.MIN_PLAYERS);
        out.put("inGame", isInGame());

        JSONArray players = new JSONArray();
        for (String username : activeUsernames) {
            JSONObject player = new JSONObject();
            player.put("name", username);
            // Absent rather than null when they have no picture, so the client falls
            // back rather than trying to load an empty source.
            String avatar = usernameToAvatarUrl.get(username);
            if (avatar != null) {
                player.put("avatar", avatar);
            }
            players.put(player);
        }
        out.put("players", players);
        return out;
    }

    /**
     * Whether this lobby should be offered in the list of open games.
     *
     * @return true if someone could join it right now.
     */
    synchronized public boolean isJoinable() {
        // A lobby with nobody in it has usually just been abandoned; the ten minute
        // reaper will clear it, but there is no reason to offer it in the meantime.
        return !isInGame() && !isFull() && !hasTimedOut() && getUserCount() > 0;
    }

    /**
     * Returns the current game.
     * 
     * @throws RuntimeException if called when there is no active game
     *                          ({@code !this.isInGame()}).
     * @return the SecretHitlerGame for this lobby.
     */
    synchronized public SecretHitlerGame game() {
        if (game == null) {
            throw new RuntimeException();
        } else {
            return game;
        }
    }

    // </editor-fold>

}
