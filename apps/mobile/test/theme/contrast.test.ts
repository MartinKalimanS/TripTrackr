/**
 * T006 — contract C2 (specs/002-neumorphic-ui/contracts/design-tokens.md).
 *
 * These functions are the reason SC-002 can be a standing build gate rather
 * than a release-time audit, so they are tested against the WCAG definition
 * itself — not against whatever the implementation happens to return.
 */
import { blend, contrastRatio, relativeLuminance } from '@/theme/contrast';

describe('relativeLuminance', () => {
  test('returns 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  test('applies the sRGB linearisation threshold at 0.04045', () => {
    // #0A0A0A -> 10/255 = 0.0392, below the threshold, so the linear branch
    // (c / 12.92) applies. Getting this branch wrong shifts every dark-theme
    // ratio slightly, which is exactly where the margins are thinnest.
    const expected = 10 / 255 / 12.92;
    expect(relativeLuminance('#0A0A0A')).toBeCloseTo(expected, 6);
  });

  test('weights the channels per the WCAG coefficients', () => {
    expect(relativeLuminance('#FF0000')).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance('#00FF00')).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance('#0000FF')).toBeCloseTo(0.0722, 4);
  });

  test('accepts lowercase and shorthand hex', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#fff')).toBeCloseTo(1, 5);
  });

  test('rejects a value that is not a hex colour', () => {
    expect(() => relativeLuminance('rebeccapurple')).toThrow();
    expect(() => relativeLuminance('#12345')).toThrow();
  });
});

describe('contrastRatio', () => {
  test('returns 21 for the maximum possible pair', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 4);
  });

  test('returns 1 for identical colours', () => {
    expect(contrastRatio('#E3E8EF', '#E3E8EF')).toBeCloseTo(1, 5);
  });

  test('is symmetric', () => {
    const a = contrastRatio('#E3E8EF', '#151A21');
    const b = contrastRatio('#151A21', '#E3E8EF');
    expect(a).toBeCloseTo(b, 10);
  });

  test('stays within the range [1, 21] across the token ramp', () => {
    const tones = ['#E3E8EF', '#23272F', '#151A21', '#EDF0F5', '#79838F', '#2456C7'];
    for (const a of tones) {
      for (const b of tones) {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21);
      }
    }
  });

  test('reproduces the ratios measured during planning', () => {
    // These are the numbers recorded in research.md R-002 and data-model.md.
    // If the implementation drifts, the design documents become fiction.
    expect(contrastRatio('#E3E8EF', '#151A21')).toBeCloseTo(14.19, 1);
    expect(contrastRatio('#E3E8EF', '#4C5666')).toBeCloseTo(6.03, 1);
    expect(contrastRatio('#E3E8EF', '#767F8C')).toBeCloseTo(3.29, 1);
    expect(contrastRatio('#23272F', '#EDF0F5')).toBeCloseTo(13.11, 1);
    expect(contrastRatio('#23272F', '#6B7482')).toBeCloseTo(3.17, 1);
  });

  test('confirms shadow tones cannot reach the 3:1 non-text floor', () => {
    // The finding the whole design rests on (research R-002). If this ever
    // passes 3.0, the border-on-interactive-elements decision was unnecessary
    // and should be revisited rather than silently kept.
    expect(contrastRatio('#E3E8EF', '#FFFFFF')).toBeLessThan(3);
    expect(contrastRatio('#E3E8EF', '#B4BECD')).toBeLessThan(3);
    expect(contrastRatio('#23272F', '#2E343E')).toBeLessThan(3);
    expect(contrastRatio('#23272F', '#171A20')).toBeLessThan(3);
  });
});

/**
 * 004 contract C4-2. `blend` is what lets the gate measure the soft chips and the
 * hover and pressed fills the kit derives, so it is tested against the sRGB
 * compositing definition (per-channel linear interpolation of the encoded
 * values) and against numbers measured in research D4-01, not against itself.
 */
describe('blend — contract C4-2', () => {
  test('alpha 0 returns the background and alpha 1 the foreground', () => {
    expect(blend('#2456C7', '#FEFDFB', 0)).toBe('#FEFDFB');
    expect(blend('#2456C7', '#FEFDFB', 1)).toBe('#2456C7');
  });

  test('composites each sRGB channel linearly and rounds to the nearest integer', () => {
    // 255 * 0.85 = 216.75 -> 217 (0xD9)
    expect(blend('#000000', '#FFFFFF', 0.15)).toBe('#D9D9D9');
    // 0x20 * 0.5 + 0x40 * 0.5 = 0x30 exactly
    expect(blend('#204060', '#406080', 0.5)).toBe('#305070');
    // Channels are independent: 100 * 0.25 + 200 * 0.75 = 175 (0xAF)
    expect(blend('#640000', '#C80000', 0.25)).toBe('#AF0000');
  });

  test('returns an uppercase #RRGGBB for lowercase and shorthand inputs', () => {
    expect(blend('#abcdef', '#012345', 0.5)).toMatch(/^#[0-9A-F]{6}$/);
    expect(blend('#fff', '#000', 1)).toBe('#FFFFFF');
    expect(blend('#fff', '#000', 0)).toBe('#000000');
  });

  test('is symmetric under swapping the operands and mirroring alpha', () => {
    // Values chosen so no channel lands on a .5 rounding boundary.
    expect(blend('#2456C7', '#FEFDFB', 0.15)).toBe(blend('#FEFDFB', '#2456C7', 0.85));
  });

  test('is pure: the same inputs give the same output', () => {
    expect(blend('#7FA8FF', '#141B25', 0.15)).toBe(blend('#7FA8FF', '#141B25', 0.15));
  });

  test('reproduces the soft chip ratios measured in research D4-01', () => {
    // Accent text on a 15% accent chip over surface and over canvas, light theme.
    expect(contrastRatio('#2456C7', blend('#2456C7', '#FEFDFB', 0.15))).toBeCloseTo(
      5.1,
      1,
    );
    expect(contrastRatio('#2456C7', blend('#2456C7', '#F5F2EB', 0.15))).toBeCloseTo(
      4.68,
      1,
    );
    // The planning-ink correction: #9A5B00 on a 15% chip fails, #854E00 passes.
    expect(contrastRatio('#9A5B00', blend('#9A5B00', '#F5F2EB', 0.15))).toBeLessThan(4.5);
    expect(contrastRatio('#854E00', blend('#9A5B00', '#F5F2EB', 0.15))).toBeGreaterThan(
      4.5,
    );
    // Dark theme.
    expect(contrastRatio('#7FA8FF', blend('#7FA8FF', '#141B25', 0.15))).toBeCloseTo(
      5.64,
      1,
    );
    expect(contrastRatio('#7FA8FF', blend('#7FA8FF', '#091018', 0.15))).toBeCloseTo(
      6.39,
      1,
    );
  });

  test('rejects an alpha outside 0..1, or one that is not a number', () => {
    expect(() => blend('#000000', '#FFFFFF', -0.01)).toThrow(RangeError);
    expect(() => blend('#000000', '#FFFFFF', 1.01)).toThrow(RangeError);
    expect(() => blend('#000000', '#FFFFFF', Number.NaN)).toThrow(RangeError);
  });

  test('rejects a colour that is not a hex colour, like its siblings', () => {
    expect(() => blend('red', '#FFFFFF', 0.5)).toThrow();
    expect(() => blend('#000000', 'rgb(0,0,0)', 0.5)).toThrow();
  });
});
