/**
 * T006 — contract C2 (specs/002-neumorphic-ui/contracts/design-tokens.md).
 *
 * These functions are the reason SC-002 can be a standing build gate rather
 * than a release-time audit, so they are tested against the WCAG definition
 * itself — not against whatever the implementation happens to return.
 */
import { contrastRatio, relativeLuminance } from '@/theme/contrast';

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
