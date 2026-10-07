/**
 * `Avatar` - a person as initials (feature 004; contract C4-8; FR-030), over the kit's
 * Avatar.
 *
 *   <Avatar name="Ada Lovelace" />                    announced "Ada Lovelace", shows AL
 *   <Avatar name="Ada Lovelace" size="lg" decorative /> beside the name: hidden from AT
 *
 * - The initials are the first letters of up to two words of `name`, upper-cased
 *   (`initialsOf`); an empty name shows `?`. A letter keeps its accent, an emoji or a
 *   flag counts as ONE letter (never half a surrogate pair), extra and unusual spaces
 *   are ignored.
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
const REGIONAL_INDICATOR_START = 0x1f1e6;
const REGIONAL_INDICATOR_END = 0x1f1ff;

function isRegionalIndicator(glyph: string | undefined): boolean {
  const point = glyph?.codePointAt(0) ?? 0;
  return point >= REGIONAL_INDICATOR_START && point <= REGIONAL_INDICATOR_END;
}

/** A combining accent (U+0300 to U+036F) or the emoji variation selector (U+FE0F). */
function isCombining(glyph: string): boolean {
  const point = glyph.codePointAt(0) ?? 0;
  return (point >= 0x300 && point <= 0x36f) || point === 0xfe0f;
}

/**
 * The first letter of a word as the reader sees it: a whole code point (not half a
 * surrogate pair), with the accents or variation selector that follow it, and both
 * halves of a flag.
 */
function firstGlyph(word: string): string {
  const points = Array.from(word);
  let glyph = points[0] ?? '';
  let next = 1;
  if (isRegionalIndicator(points[0]) && isRegionalIndicator(points[1])) {
    glyph += points[1];
    next = 2;
  }
  while (next < points.length && isCombining(points[next])) {
    glyph += points[next];
    next += 1;
  }
  return glyph;
}

/** The first letters of up to two words of a display name, upper-cased; `?` when empty. */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return words.length === 0
    ? EMPTY_INITIALS
    : words.map((word) => firstGlyph(word).toUpperCase()).join('');
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
