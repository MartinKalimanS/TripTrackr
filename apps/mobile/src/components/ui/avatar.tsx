/**
 * `Avatar` - a person as initials (feature 004; contract C4-8; FR-030), over the kit's
 * Avatar.
 *
 *   <Avatar name="Ada Lovelace" />                    announced "Ada Lovelace", shows AL
 *   <Avatar name="Ada Lovelace" size="lg" decorative /> beside the name: hidden from AT
 *
 * - The initials are the first letters of up to two words of `name`, capitalised
 *   (`initialsOf`); a name with none shows `?`. A letter is one GRAPHEME as the reader
 *   sees it: a base with its combining marks in any script, an emoji with its skin
 *   tone or ZWJ sequence, a flag, a keycap. Leading punctuation is skipped (a bracket,
 *   a quote, an '@'), a word with no letter, number or pictograph is not a word, and
 *   'ß' is 'S', never 'SS'. Extra and unusual spaces are ignored.
 * - The fill is the kit's solid `default` with its ink-coloured fallback text (a pair
 *   the contrast gate measures at 4.5:1). A soft fill is never used: review rule 5.
 * - Accessibility: the avatar is an image whose name is the person's name (not their
 *   initials). It is "decorative unless it is the only identifier" (C4-8): pass
 *   `decorative` when the name is written beside it, and it is hidden from assistive
 *   technology. An empty name leaves nothing to announce, so it is hidden as well.
 * - Sizes are the kit's: `sm` 40, `md` 48 (default), `lg` 64 dp. The kit caps the
 *   initials at 1.4x the font scale so they stay inside the circle; an avatar is not a
 *   control, so it has no touch target.
 * - No photograph yet: the trip owner and companions are initials only. A photo would be
 *   added here (`Avatar.Image`) without changing a caller.
 */
import { Avatar as KitAvatar } from 'heroui-native';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  /** The person's display name. */
  name: string;
  /** Default `md`. */
  size?: AvatarSize;
  /** The name is written beside the avatar: hide it from assistive technology. */
  decorative?: boolean;
  testID?: string;
}

const EMPTY_INITIALS = '?';

/**
 * Where a word's initial can start: a keycap (its base, '#' or '*', is punctuation), or a
 * letter, a number, a pictograph or a flag. Anything before it (a bracket, a quote, a
 * dash, an '@') is skipped, and a word with none of them is not a word.
 */
const INITIAL_START =
  /(?:[0-9#*]\uFE0F?\u20E3|[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}])/u;

/**
 * The grapheme that starts a string, as the reader sees one letter: a flag (two regional
 * indicators), or a base with its combining marks of every script (accents, vowel signs,
 * harakat, niqqud, the emoji variation selector, a keycap's enclosing mark), then any
 * skin-tone modifier, subdivision-flag tag, or zero-width-joined base that follows (a
 * family, a rainbow flag, a woman astronaut). It is one regular expression with the u
 * flag, no look-behind and only \p{...} escapes, which Hermes supports (the literals were
 * compiled with hermesc). Indic conjuncts joined by a virama are not kept whole.
 */
const GRAPHEME =
  /^(?:\p{Regional_Indicator}{2}|\P{M}\p{M}*(?:\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}]|\u200D\P{M}\p{M}*)*)/u;

/** The initial of a word, or '' for a word without one. */
function initialOf(word: string): string {
  const at = word.search(INITIAL_START);
  if (at < 0) return '';
  const glyph = GRAPHEME.exec(word.slice(at))?.[0] ?? '';
  // Capitalise the base only, and keep ONE code point of it: 'ß' is 'SS' to
  // toUpperCase(), and an initial is a single letter. Marks and the rest are untouched.
  const [base = '', ...rest] = Array.from(glyph);
  const capital = Array.from(base.toUpperCase())[0] ?? base;
  return capital + rest.join('');
}

/**
 * The first letter of up to two words of a display name, capitalised; '?' when there is
 * none. Words are split on whitespace and a word with no letter, number or pictograph
 * ('&', '-') is skipped, so "Ada & Bob" is "AB".
 */
export function initialsOf(name: string): string {
  const initials = name.split(/\s+/).map(initialOf).filter(Boolean).slice(0, 2);
  return initials.length === 0 ? EMPTY_INITIALS : initials.join('');
}

const HIDDEN = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

export function Avatar({ name, size = 'md', decorative = false, testID }: AvatarProps) {
  const label = name.split(/\s+/).filter(Boolean).join(' ');
  const hidden = decorative || label === '';
  return (
    <KitAvatar
      size={size}
      variant="default"
      color="default"
      alt={label}
      testID={testID}
      {...(hidden
        ? HIDDEN
        : { accessible: true, accessibilityRole: 'image', accessibilityLabel: label })}>
      <KitAvatar.Fallback>{initialsOf(name)}</KitAvatar.Fallback>
    </KitAvatar>
  );
}
