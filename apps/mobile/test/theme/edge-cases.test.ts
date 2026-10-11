/**
 * Branch coverage for paths the main suites exercise only on their happy side.
 * Each of these is a real behaviour, not a coverage filler.
 */
import { Colors } from '@/constants/theme';
import {
  readPrefersMoreContrast,
  type AccessibilityQueries,
} from '@/theme/accessibility';
import { ContrastFloor, meetsFloor } from '@/theme/contrast';
import { Palettes } from '@/theme/palette';

describe('meetsFloor — contract C3 helper', () => {
  test('accepts a pair that clears its floor', () => {
    expect(meetsFloor(Colors.light.textPrimary, Colors.light.canvas, 'normalText')).toBe(
      true,
    );
  });

  test('rejects a pair that does not', () => {
    // The separator is a decorative hairline and cannot reach the non-text floor.
    expect(meetsFloor(Palettes.light.separator, Palettes.light.canvas, 'nonText')).toBe(
      false,
    );
  });

  test('applies the stricter floor when increased contrast is requested', () => {
    expect(meetsFloor(Colors.light.textMuted, Colors.light.canvas, 'normalText')).toBe(
      true,
    );
    expect(
      meetsFloor(Colors.light.textMuted, Colors.light.canvas, 'increasedContrast'),
    ).toBe(false);
    expect(ContrastFloor.increasedContrast).toBeGreaterThan(ContrastFloor.normalText);
  });
});

describe('readPrefersMoreContrast on an unrecognised platform', () => {
  test('reports false rather than guessing at a setting that does not exist', async () => {
    await expect(
      readPrefersMoreContrast('windows', {} as AccessibilityQueries),
    ).resolves.toBe(false);
  });
});
