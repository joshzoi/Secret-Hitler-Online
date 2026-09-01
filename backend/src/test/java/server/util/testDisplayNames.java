package server.util;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import server.auth.SlackProfile;

import static junit.framework.TestCase.*;

public class testDisplayNames {

    private static SlackProfile profile(String given, String family) {
        String full = family == null ? given : given + " " + family;
        return new SlackProfile("U1", "T1", full, given, family, null);
    }

    private static Set<String> taken(String... names) {
        return new HashSet<>(Arrays.asList(names));
    }

    @Test
    public void usesTheFirstNameWhenItIsFree() {
        assertEquals("Joshua", DisplayNames.uniqueNameFor(profile("Joshua", "Favetti"), Collections.emptySet()));
    }

    @Test
    public void addsASurnameInitialOnACollision() {
        assertEquals("Joshua F", DisplayNames.uniqueNameFor(profile("Joshua", "Favetti"), taken("Joshua")));
    }

    @Test
    public void fallsBackToTheWholeSurnameWhenTheInitialIsAlsoTaken() {
        assertEquals("Joshua Fell",
                DisplayNames.uniqueNameFor(profile("Joshua", "Fell"), taken("Joshua", "Joshua F")));
    }

    @Test
    public void numbersTheNameWhenEvenTheSurnameCollides() {
        Set<String> used = taken("Joshua", "Joshua F", "Joshua Favett");
        String name = DisplayNames.uniqueNameFor(profile("Joshua", "Favett"), used);
        assertFalse(used.contains(name));
        assertTrue(name.startsWith("Joshua"));
    }

    @Test
    public void comparesNamesWithoutCase() {
        // "sam" sitting beside "Sam" is exactly the confusion this change is about.
        String name = DisplayNames.uniqueNameFor(profile("Sam", "Okonkwo"), taken("sam"));
        assertFalse("sam".equalsIgnoreCase(name));
    }

    @Test
    public void doesNotReuseANameSomeoneElseHolds() {
        String name = DisplayNames.uniqueNameFor(profile("Bot", "One"), taken("Bot"));
        assertFalse(name.equals("Bot"));
    }

    @Test
    public void fallsBackToTheFirstWordOfTheFullNameWithoutAGivenName() {
        SlackProfile noGiven = new SlackProfile("U1", "T1", "Marcus Delacroix", null, "Delacroix", null);
        assertEquals("Marcus", DisplayNames.uniqueNameFor(noGiven, Collections.emptySet()));
    }

    @Test
    public void alwaysProducesSomethingEvenWithNoNameAtAll() {
        SlackProfile nameless = new SlackProfile("U1", "T1", null, null, null, null);
        String name = DisplayNames.uniqueNameFor(nameless, Collections.emptySet());
        assertNotNull(name);
        assertFalse(name.isEmpty());
    }

    @Test
    public void capsTheLength() {
        String name = DisplayNames.uniqueNameFor(profile("Bartholomewwwwwwwwwwwww", "Smith"), Collections.emptySet());
        assertTrue(name.codePointCount(0, name.length()) <= DisplayNames.MAX_LENGTH);
    }

    @Test
    public void neverSplitsASurrogatePairWhenTruncating() {
        // Emoji are two chars each, so truncating by char index would cut one in half
        // and put an unpaired surrogate into the packet sent to every player.
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < 10; i++) {
            builder.append(new String(Character.toChars(0x1F600)));
        }
        String name = DisplayNames.sanitize(builder.toString());
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            if (Character.isHighSurrogate(c)) {
                assertTrue("high surrogate with nothing after it", i + 1 < name.length());
                assertTrue("high surrogate not followed by a low one", Character.isLowSurrogate(name.charAt(i + 1)));
            }
            if (Character.isLowSurrogate(c)) {
                assertTrue("low surrogate with nothing before it", i > 0);
                assertTrue("low surrogate not preceded by a high one", Character.isHighSurrogate(name.charAt(i - 1)));
            }
        }
    }

    @Test
    public void stripsDirectionOverrides() {
        // U+202E flips the reading order of everything after it, so it does not only
        // disguise its own name -- it rearranges the rest of the player list.
        assertEquals("Sam", DisplayNames.sanitize("Sam\u202E"));
    }

    @Test
    public void stripsZeroWidthCharacters() {
        // Otherwise two visually identical names sit in the lobby as different people.
        assertEquals("Sam", DisplayNames.sanitize("Sam\u200B"));
    }

    @Test
    public void collapsesWhitespace() {
        assertEquals("Sam O", DisplayNames.sanitize("  Sam    O  "));
    }

    @Test
    public void keepsAccentsAndApostrophes() {
        assertEquals("Renée", DisplayNames.sanitize("Renée"));
        assertEquals("O'Neill", DisplayNames.sanitize("O'Neill"));
    }
}
