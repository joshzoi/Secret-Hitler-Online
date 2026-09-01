package server.util;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

import server.auth.SlackProfile;

/**
 * Turns a Slack profile into the name a player is known by inside one lobby.
 *
 * First names, because they are what people actually call each other and they
 * fit on a player card. A surname initial is added only when two people would
 * otherwise collide.
 */
public class DisplayNames {

    /** Room for "Joshua F" on the card without the text shrinking to fit. */
    public static final int MAX_LENGTH = 12;
    private static final String FALLBACK = "Player";

    /**
     * Picks a name for this player that nobody else in the lobby is using.
     *
     * @param profile the Slack profile to name them from.
     * @param taken   every name already spoken for, including seats held for absent
     *                players.
     * @return a name that is not in {@code taken}.
     */
    public static String uniqueNameFor(SlackProfile profile, Set<String> taken) {
        String base = sanitize(profile.getGivenName());
        if (base.isEmpty()) {
            base = sanitize(firstWord(profile.getDisplayName()));
        }
        if (base.isEmpty()) {
            base = FALLBACK;
        }
        if (isFree(base, taken)) {
            return base;
        }

        String family = sanitize(profile.getFamilyName());
        if (!family.isEmpty()) {
            String withInitial = truncate(base + " " + family.charAt(0));
            if (isFree(withInitial, taken)) {
                return withInitial;
            }
            String withSurname = truncate(base + " " + family);
            if (isFree(withSurname, taken)) {
                return withSurname;
            }
        }

        // Two people with the same first name and the same surname initial. Rare
        // enough that a number is fine, and it always terminates: a lobby holds ten.
        for (int i = 2; i < 100; i++) {
            String suffix = " " + i;
            String numbered = truncate(base, MAX_LENGTH - suffix.length()) + suffix;
            if (isFree(numbered, taken)) {
                return numbered;
            }
        }
        return truncate(base + " " + System.currentTimeMillis() % 1000);
    }

    /**
     * Strips a name down to something safe to show and to use as a key.
     *
     * Slack display names are set by the person they belong to, so they can carry
     * control characters and bidirectional overrides -- which would rewrite how the
     * rest of the player list reads on screen, not just their own row.
     *
     * @return the cleaned name, possibly empty.
     */
    public static String sanitize(String raw) {
        if (raw == null) {
            return "";
        }
        String normalized = Normalizer.normalize(raw, Normalizer.Form.NFC);
        StringBuilder out = new StringBuilder(normalized.length());
        int i = 0;
        while (i < normalized.length()) {
            int codePoint = normalized.codePointAt(i);
            i += Character.charCount(codePoint);
            int type = Character.getType(codePoint);
            if (type == Character.CONTROL || type == Character.FORMAT
                    || type == Character.SURROGATE || type == Character.UNASSIGNED) {
                continue;
            }
            if (Character.isLetterOrDigit(codePoint) || type == Character.NON_SPACING_MARK
                    || type == Character.COMBINING_SPACING_MARK || codePoint == '\''
                    || codePoint == '-' || codePoint == '.' || codePoint == ' ') {
                out.appendCodePoint(codePoint);
            }
        }
        // Collapse the runs of whitespace that dropping characters can leave behind.
        String cleaned = out.toString().replaceAll("\\s+", " ").trim();
        return truncate(cleaned);
    }

    private static String truncate(String value) {
        return truncate(value, MAX_LENGTH);
    }

    /**
     * Shortens to a number of code points, never bytes or chars: cutting a string
     * mid-surrogate produces an unpaired half that is not valid text and would go
     * out in a packet to every player.
     */
    private static String truncate(String value, int maxLength) {
        if (maxLength <= 0) {
            return "";
        }
        int count = value.codePointCount(0, value.length());
        if (count <= maxLength) {
            return value;
        }
        return value.substring(0, value.offsetByCodePoints(0, maxLength)).trim();
    }

    private static String firstWord(String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        int space = trimmed.indexOf(' ');
        return space == -1 ? trimmed : trimmed.substring(0, space);
    }

    /** Names are compared without case, so "sam" cannot sit beside "Sam". */
    private static boolean isFree(String candidate, Set<String> taken) {
        if (candidate.isEmpty()) {
            return false;
        }
        for (String name : taken) {
            if (name != null && name.toLowerCase(Locale.ROOT).equals(candidate.toLowerCase(Locale.ROOT))) {
                return false;
            }
        }
        return true;
    }
}
