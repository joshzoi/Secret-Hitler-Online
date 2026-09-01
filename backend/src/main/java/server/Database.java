package server;

import java.net.URI;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Access to the Postgres database that stores lobby backups and sign-in sessions.
 *
 * There is no connection pool: every caller opens a connection and closes it.
 * That is cheap enough for the backup, which runs once a minute, but not for
 * anything on the path of a request -- see SessionStore, which keeps sessions in
 * memory and only reaches the database on a miss.
 */
public class Database {

    private static Logger logger = LoggerFactory.getLogger(Database.class);

    /**
     * Attempts to get a connection to the Postgres database.
     *
     * @return null if no connection could be made, otherwise a
     *         {@code java.sql.Connection}.
     */
    public static Connection getConnection() {
        Connection c;
        try {
            String envUri = ApplicationConfig.DATABASE_URI;
            if (envUri == null) {
                logger.error("Could not connect to database: No DATABASE_URL environment variable provided.");
                return null;
            }
            URI databaseUri = new URI(envUri);

            String username = databaseUri.getUserInfo().split(":")[0];
            String password = databaseUri.getUserInfo().split(":")[1];
            String dbUrl = "jdbc:postgresql://" + databaseUri.getHost() + ':' + databaseUri.getPort()
                    + databaseUri.getPath();

            Class.forName("org.postgresql.Driver");
            c = DriverManager.getConnection(dbUrl, username, password);
            return c;
        } catch (Exception e) {
            // Print failures no matter what
            logger.error("Failed to connect to database.", e);
            return null;
        }
    }

    /**
     * Creates the tables the server needs, if they are not already there.
     *
     * Called on startup before anything serves traffic. Signing in reads and writes
     * user_session, so a failure here has to be loud rather than swallowed on the
     * way past.
     *
     * @return true if the schema is ready to use.
     */
    public static boolean initialize() {
        Connection c = getConnection();
        if (c == null) {
            logger.error("Could not initialize the database: no connection.");
            return false;
        }
        try {
            initializeSchema(c);
            logger.info("Database schema is ready.");
            return true;
        } catch (SQLException e) {
            logger.error("Failed to initialize the database schema.", e);
            return false;
        } finally {
            close(c);
        }
    }

    /**
     * Adds the backup and session tables.
     *
     * @param c the connection to the database.
     * @effects the database has the tables the server needs.
     */
    public static void initializeSchema(Connection c) throws SQLException {
        Statement stmt = c.createStatement();
        try {
            stmt.executeUpdate("create table if not exists backup " +
                    "(id INT UNIQUE, timestamp TEXT, attempts INT, lobby_bytes BYTEA);");

            // Sessions live in real columns rather than in the serialized backup
            // blob. The blob is rewritten wholesale on a timer, so a session minted
            // just before a crash would be lost, and it carries no way to expire a
            // session or to sign someone out.
            //
            // token_hash, not the token: a leaked dump then cannot be replayed as a
            // live session.
            stmt.executeUpdate("create table if not exists user_session ("
                    + "token_hash TEXT PRIMARY KEY, "
                    + "slack_user_id TEXT NOT NULL, "
                    + "slack_team_id TEXT NOT NULL, "
                    + "display_name TEXT NOT NULL, "
                    + "given_name TEXT, "
                    + "family_name TEXT, "
                    + "avatar_url TEXT, "
                    + "created_at BIGINT NOT NULL, "
                    + "expires_at BIGINT NOT NULL);");
            stmt.executeUpdate("create index if not exists user_session_expires_at_idx "
                    + "on user_session (expires_at);");
        } finally {
            stmt.close();
        }
    }

    /** Closes a connection, reporting rather than throwing if it will not close. */
    public static void close(Connection c) {
        if (c == null) {
            return;
        }
        try {
            c.close();
        } catch (SQLException e) {
            logger.debug("Failed to close a database connection.", e);
        }
    }
}
