/**
 * T423, T528 - contract C4-9 and C5-15 (`HeaderBackButton`), FR-008, FR-025, FR-026, research
 * D4-06 and D5-12 (feature 004, then Sunrise Passport). Maestro flows say `tapOn: 'Back'`, so
 * the accessible name is a promise: it is exactly "Back" whatever the previous screen was
 * called, whichever variant is drawn and whatever the text size.
 *
 * The control is a ROUND one (an `IconButton`, 44 dp): a cream disc with a hairline on the
 * canvas (`default`), or a `scrimButton` disc with an `onPhoto` glyph over the trip hero
 * (`glass`, a fixed look that keeps the glyph at 3:1 over a pure white photograph). It has no
 * visible word: the name is the label, so a header of any width and any text size holds it.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { Palettes, Radii } from '@/theme';

import { appearanceOf } from '../../../test/helpers/appearance';
import { glyphsIn } from '../../../test/helpers/icons';
import { mockThemeColors } from '../../../test/helpers/theme-colors';

import { HeaderBackButton } from './header-back-button';

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: mockCanGoBack,
    replace: mockReplace,
    push: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

/** Sets the window font scale `useWindowDimensions` reports. */
function mockFontScale(fontScale: number) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale,
  });
}

beforeEach(() => {
  mockFontScale(1);
  mockCanGoBack.mockReturnValue(true);
  useAppearance.mockReturnValue(appearanceOf('light'));
  mockThemeColors('light');
});
afterEach(() => jest.restoreAllMocks());

const styleOf = (node: { props: Record<string, unknown> }) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
const back = () => screen.getByLabelText('Back');

describe('<HeaderBackButton> - FR-008, contract C4-9', () => {
  test('is a button named "Back", whichever variant', async () => {
    for (const variant of ['default', 'glass'] as const) {
      await render(<HeaderBackButton variant={variant} />);
      expect(back().props.accessibilityRole).toBe('button');
      expect(back().props.accessibilityLabel).toBe('Back');
    }
  });

  test('draws a chevron and no word: the name is the label', async () => {
    await render(<HeaderBackButton />);

    expect(glyphsIn()).toHaveLength(1);
    expect(glyphsIn()[0]).toMatchObject({ name: 'chevron-left', size: 24 });
    // The word is not drawn, so it can neither clip nor be read twice.
    expect(screen.queryByText('Back')).toBeNull();
  });

  test('forwards testID to the pressable node, and the glyph gets its own', async () => {
    await render(<HeaderBackButton testID="trip-back" />);
    expect(screen.getByTestId('trip-back')).toBe(back());
    expect(
      screen.getByTestId('trip-back-icon', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  test('a caller onPress replaces the default', async () => {
    const onPress = jest.fn();
    await render(<HeaderBackButton onPress={onPress} />);
    await fireEvent.press(back());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('does not render when navigation says there is nothing to go back to', async () => {
    await render(<HeaderBackButton canGoBack={false} />);
    expect(screen.queryByLabelText('Back')).toBeNull();
  });

  test('renders when navigation says it can go back', async () => {
    await render(<HeaderBackButton canGoBack />);
    expect(back()).toBeTruthy();
  });
});

describe('<HeaderBackButton> default press', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
  });

  test('goes back through the router when there is somewhere to go', async () => {
    await render(<HeaderBackButton />);
    await fireEvent.press(back());
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('replaces with the home when the screen was opened with no history (a deep link)', async () => {
    mockCanGoBack.mockReturnValue(false);
    await render(<HeaderBackButton />);
    await fireEvent.press(back());
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('asks the router at press time, not at render time', async () => {
    mockCanGoBack.mockReturnValue(false);
    await render(<HeaderBackButton />);
    mockCanGoBack.mockReturnValue(true);
    await fireEvent.press(back());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('<HeaderBackButton> the round control - D5-12', () => {
  test('the default is a 44 dp cream disc with a hairline on the canvas', async () => {
    await render(<HeaderBackButton />);

    expect(styleOf(back())).toMatchObject({
      width: 44,
      height: 44,
      borderRadius: Radii.full,
      backgroundColor: Palettes.light.surfaceSecondary.toLowerCase(),
      borderColor: Palettes.light.hairline.toLowerCase(),
    });
    expect(glyphsIn()[0]!.color).toBe(Palettes.light.ink.toLowerCase());
  });

  test('the glass variant is a scrimButton disc with an onPhoto glyph, for the trip hero', async () => {
    await render(<HeaderBackButton variant="glass" />);

    expect(styleOf(back())).toMatchObject({
      width: 44,
      height: 44,
      borderRadius: Radii.full,
      backgroundColor: Palettes.light.scrimButton.toLowerCase(),
      borderColor: Palettes.light.scrimButtonLine.toLowerCase(),
    });
    expect(glyphsIn()[0]!.color).toBe(Palettes.light.onPhoto.toLowerCase());
  });

  test('the glass variant is the same disc in the dark themes: the photograph does not change', async () => {
    useAppearance.mockReturnValue(appearanceOf('dark'));
    mockThemeColors('dark');
    await render(<HeaderBackButton variant="glass" />);
    expect(styleOf(back()).backgroundColor).toBe(Palettes.dark.scrimButton.toLowerCase());
  });
});

describe('<HeaderBackButton> as a stack headerLeft', () => {
  test('takes the props React Navigation hands a headerLeft, and keeps its name', async () => {
    const headerLeft = (props: Record<string, unknown>) => (
      <HeaderBackButton {...props} />
    );
    await render(
      headerLeft({
        tintColor: 'ignored',
        label: 'Trips',
        href: '/trips',
        canGoBack: true,
      }),
    );
    // The previous screen's title is never the name: "Back" is what the flows tap.
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.queryByLabelText('Trips')).toBeNull();
  });

  test('reaches the platform minimum target: the disc plus the slop around it', async () => {
    await render(<HeaderBackButton />);
    const slop = back().props.hitSlop as { left: number; right: number };
    expect(44 + slop.left + slop.right).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test.each([1, 1.3, 2, 3.1])(
    'does not outgrow the fixed-height header at font scale %s',
    async (fontScale) => {
      mockFontScale(fontScale);
      await render(<HeaderBackButton />);
      expect(styleOf(back())).toMatchObject({ width: 44, height: 44 });
    },
  );
});
