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
import { surfaceStyle } from '@/theme/surfaces';

describe('meetsFloor — contract C3 helper', () => {
  test('accepts a pair that clears its floor', () => {
    expect(meetsFloor(Colors.light.textPrimary, Colors.light.canvas, 'normalText')).toBe(
      true,
    );
  });

  test('rejects a pair that does not', () => {
    // Shadow tones are decorative and cannot reach the non-text floor.
    expect(meetsFloor(Colors.light.shadowLight, Colors.light.canvas, 'nonText')).toBe(
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

describe('surfaceStyle option defaults', () => {
  test('defaults to depth 1 and the medium radius', () => {
    const explicit = surfaceStyle('raised', {
      theme: 'light',
      profile: 'full',
      depth: 1,
      radius: 'md',
    });
    const defaulted = surfaceStyle('raised', { theme: 'light', profile: 'full' });
    expect(defaulted).toEqual(explicit);
  });

  test('honours an explicit interactive override on a normally-static treatment', () => {
    const bordered = surfaceStyle('recessed', {
      theme: 'light',
      profile: 'full',
      interactive: true,
    });
    const plain = surfaceStyle('recessed', { theme: 'light', profile: 'full' });
    expect(bordered.borderWidth).toBeGreaterThan(0);
    expect(plain.borderWidth).toBeUndefined();
  });

  test('composes pending onto a flat treatment as well as a raised one (FR-007)', () => {
    const flatPending = surfaceStyle('flat', {
      theme: 'light',
      profile: 'full',
      pending: true,
    });
    expect(flatPending.borderColor).toBe(Colors.light.accent);
    expect(flatPending.borderStyle).toBe('dashed');
  });

  test('renders busy and disabled at distinct opacities', () => {
    const busy = surfaceStyle('busy', { theme: 'light', profile: 'full' });
    const disabled = surfaceStyle('disabled', { theme: 'light', profile: 'full' });
    expect(busy.opacity).toBeGreaterThan(disabled.opacity as number);
  });
});
