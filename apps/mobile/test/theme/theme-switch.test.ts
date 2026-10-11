/**
 * T037–T038 — US3, FR-022 and FR-023.
 *
 * The failure this guards against is the "half-converted" screen: a theme
 * change that reaches some surfaces and not others. Because every token is read
 * from one palette per theme, a switch either changes everything or nothing —
 * these tests assert that property rather than sampling components one by one.
 * Feature 004 T453: the tokens exist for all four themes, increased contrast
 * included.
 */
import { Colors } from '@/constants/theme';
import { PaletteNames, Palettes, type PaletteName } from '@/theme/palette';

/** Widened to `string`: the comparisons below are exactly what is asserted at runtime. */
const tokensOf = (name: PaletteName): Record<string, string> => Colors[name];

const PAIRS = [
  ['light', 'dark'],
  ['light-contrast', 'dark-contrast'],
] as const;

describe('theme switching — FR-022, FR-023', () => {
  test('all four themes expose the same complete token set — none is a partial conversion', () => {
    const reference = Object.keys(Colors.light).sort();
    expect(reference.length).toBeGreaterThan(0);
    for (const name of PaletteNames) {
      expect(Object.keys(Colors[name]).sort()).toEqual(reference);
    }
  });

  test.each(PaletteNames)('every %s token is an opaque six-digit hex colour', (name) => {
    for (const [token, value] of Object.entries(tokensOf(name))) {
      expect({ token, value }).toEqual({
        token,
        value: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/),
      });
    }
  });

  test.each(PAIRS)(
    'no token holds the same value in %s and %s by accident',
    (first, second) => {
      // A token identical across themes is almost always one that was added to
      // one ramp and copied without being re-chosen for the other.
      const a = tokensOf(first);
      const b = tokensOf(second);
      expect(Object.keys(a).filter((key) => a[key] === b[key])).toEqual([]);
    },
  );

  test.each(['light', 'dark'] as const)(
    'increased contrast changes the %s canvas, and the tokens follow the palette',
    (scheme) => {
      const contrast: PaletteName = `${scheme}-contrast`;
      expect(Colors[contrast].canvas).not.toBe(Colors[scheme].canvas);
      expect(Colors[contrast].canvas).toBe(Palettes[contrast].canvas);
    },
  );
});
