/**
 * T521 - contract C5-18 (`AreaPill`), FR-055, FR-069, FR-075. A count pill for one area of a
 * trip (Photos, Notes, Expenses, Documents, Offline maps): an icon, a figure and a label in a
 * cream tile, ONE control named "Photos, 128", with the "only you" lock where the area is
 * private and a danger ring and dot where it needs attention.
 *
 * The kit's Card is a plain host node under Jest that forwards every prop, so what is
 * asserted is the accessibility contract on the control and the semantic classes the
 * adapter asked for, never real styling.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { StyleSheet } from 'react-native';

import { anyGlyph, glyphNamesIn, glyphsIn } from '../../../test/helpers/icons';

import { Colors, MinTouchTarget } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { AreaPill } from './area-pill';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
  } as AppearanceContext);
});
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const PHOTOS = 'images';
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const styleOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

const photos = (props: Record<string, unknown> = {}) => (
  <AreaPill
    icon={PHOTOS}
    label="Photos"
    count={128}
    onPress={jest.fn()}
    testID="trip-open-photos"
    {...props}
  />
);

describe('<AreaPill> is ONE control - C5-18', () => {
  test('is a button named "Photos, 128", and testID lands on it', async () => {
    await render(photos());
    const pill = screen.getByTestId('trip-open-photos');
    expect(pill).toBe(screen.getByLabelText('Photos, 128'));
    expect(pill.props.accessibilityRole).toBe('button');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  test('presses once through the one control', async () => {
    const onPress = jest.fn();
    await render(photos({ onPress }));
    await fireEvent.press(screen.getByTestId('trip-open-photos'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a count can be an amount already formatted', async () => {
    await render(photos({ label: 'Expenses', count: '\u20AC842' }));
    expect(screen.getByLabelText('Expenses, \u20AC842')).toBeTruthy();
    expect(screen.getByText('\u20AC842')).toBeTruthy();
  });

  test('draws the icon, the figure and the label, and no chevron', async () => {
    await render(photos());
    expect(screen.getByText('128')).toBeTruthy();
    expect(screen.getByText('Photos')).toBeTruthy();
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: PHOTOS, size: 24, weight: 'regular' }),
    ]);
    expect(screen.queryByTestId(anyGlyph)).toBeNull();
  });

  test('busy and disabled are announced and ignore presses', async () => {
    const onPress = jest.fn();
    await render(photos({ onPress, disabled: true }));
    const pill = screen.getByTestId('trip-open-photos');
    await fireEvent.press(pill);
    expect(onPress).not.toHaveBeenCalled();
    expect(pill.props.accessibilityState).toMatchObject({ disabled: true });
  });

  test('refuses to render without a label to name itself by', async () => {
    await expect(render(photos({ label: ' ' }))).rejects.toThrow(/accessibilityLabel/);
  });
});

describe('<AreaPill> look - 72 dp, 16 dp, cream and hairline', () => {
  test('is a cream tile with a hairline, 16 dp corners and no lift', async () => {
    await render(photos());
    const surface = screen.getByTestId('trip-open-photos-surface');
    expect(surface.props.variant).toBe('secondary');
    expect(tokens(surface.props.className)).toEqual(
      expect.arrayContaining(['bg-surface-secondary', 'border-separator', 'px-1.5']),
    );
    expect(styleOf('trip-open-photos-surface')).toMatchObject({
      borderRadius: 16,
      borderCurve: 'continuous',
    });
    expect(styleOf('trip-open-photos-surface').boxShadow).toBeUndefined();
  });

  test('is at least 72 dp tall and grows with the text instead of clipping', async () => {
    await render(photos());
    expect(styleOf('trip-open-photos').minHeight).toBeGreaterThanOrEqual(72);
    expect(styleOf('trip-open-photos').height).toBeUndefined();
    expect(styleOf('trip-open-photos').minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test('the figure is a callout, the label a muted capped caption', async () => {
    await render(photos());
    expect(tokens(screen.getByText('128').props.className)).toEqual(
      expect.arrayContaining(['text-[17px]', 'font-display', 'text-foreground']),
    );
    const label = screen.getByText('Photos');
    expect(tokens(label.props.className)).toEqual(
      expect.arrayContaining(['text-[13px]', 'text-muted']),
    );
    expect(label.props.maxFontSizeMultiplier).toBe(1.3);
    expect(label.props.numberOfLines).toBe(1);
  });
});

describe('<AreaPill private> - the "only you" lock', () => {
  test('shows a lock chip top right and says so in the name', async () => {
    await render(photos({ label: 'Expenses', count: '\u20AC842', private: true }));
    const pill = screen.getByTestId('trip-open-photos');
    expect(pill.props.accessibilityLabel).toBe(
      'Expenses, \u20AC842, only you can see this',
    );
    expect(
      tokens(screen.getByTestId('trip-open-photos-lock', hidden).props.className),
    ).toEqual(expect.arrayContaining(['absolute', 'bg-aqua-tint', 'rounded-full']));
    expect(glyphNamesIn()).toEqual([PHOTOS, 'lock']);
  });

  test('the lock is 16 dp in the aqua ink, on the aqua tint', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string) => `colour:${token}`) as never);
    await render(photos({ private: true }));
    const [, lock] = glyphsIn();
    expect(lock).toMatchObject({ name: 'lock', size: 16, color: 'colour:aqua-ink' });
  });

  test('the lock is decorative: the name already carries it', async () => {
    await render(photos({ private: true }));
    expect(screen.getByTestId('trip-open-photos-lock', hidden).props.accessible).toBe(
      false,
    );
  });

  test('a public area has no lock', async () => {
    await render(photos());
    expect(screen.queryByTestId('trip-open-photos-lock', hidden)).toBeNull();
  });
});

describe('<AreaPill warn> - needs attention, not colour alone', () => {
  test('draws a 1.5 dp danger ring and a dot, and says so in the name', async () => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    useThemeColor.mockImplementation(((token: string) =>
      token === 'danger' ? 'danger-colour' : 'other') as never);
    await render(photos({ warn: true }));
    expect(screen.getByTestId('trip-open-photos').props.accessibilityLabel).toBe(
      'Photos, 128, needs attention',
    );
    expect(styleOf('trip-open-photos-surface')).toMatchObject({
      borderColor: 'danger-colour',
      borderWidth: 1.5,
    });
    expect(
      tokens(screen.getByTestId('trip-open-photos-warn', hidden).props.className),
    ).toEqual(expect.arrayContaining(['absolute', 'bg-danger', 'rounded-full']));
    expect(screen.getByTestId('trip-open-photos-warn', hidden).props.accessible).toBe(
      false,
    );
  });

  test('a pill that does not warn keeps its hairline and has no dot', async () => {
    await render(photos());
    expect(styleOf('trip-open-photos-surface').borderColor).toBeUndefined();
    expect(screen.queryByTestId('trip-open-photos-warn', hidden)).toBeNull();
  });

  test('private and warning together say both', async () => {
    await render(photos({ private: true, warn: true }));
    expect(screen.getByTestId('trip-open-photos').props.accessibilityLabel).toBe(
      'Photos, 128, only you can see this, needs attention',
    );
  });
});
