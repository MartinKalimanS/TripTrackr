/**
 * T522 - contract C5-28 (`Banner`), screens.md (Home, Trips, Trip: offline and error),
 * FR-065, FR-066. A slim, non-blocking row: an icon and words, and an underlined action.
 * Offline is the amber tint, a sync error the danger tint; the error is an `alert`.
 *
 * The kit's Spinner and Button are plain host nodes under Jest that forward every prop, so
 * what is asserted is the accessibility contract on the host nodes and the semantic classes
 * the adapter asked for, never real styling.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { StyleSheet } from 'react-native';

import { anyGlyph, glyphsIn } from '../../../test/helpers/icons';

import { Colors, MinTouchTarget } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { Banner } from './banner';

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

const OFFLINE = "Offline. 3 changes will sync when you're back online.";
const ERROR = "Couldn't sync 2 changes. Your trips are safe on this phone.";
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const classesOf = (testID: string) => tokens(screen.getByTestId(testID).props.className);
const styleOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

describe('<Banner tone="offline"> - amber, words and an icon', () => {
  const offline = (props: Record<string, unknown> = {}) => (
    <Banner tone="offline" message={OFFLINE} testID="banner" {...props} />
  );

  test('is the amber tint with the amber ink, a 16 dp continuous corner and no fixed height', async () => {
    await render(offline());
    expect(classesOf('banner')).toEqual(
      expect.arrayContaining(['flex-row', 'items-center', 'bg-amber-tint']),
    );
    expect(styleOf('banner')).toMatchObject({
      borderRadius: 16,
      borderCurve: 'continuous',
    });
    expect(styleOf('banner').height).toBeUndefined();
    expect(tokens(screen.getByText(OFFLINE).props.className)).toEqual(
      expect.arrayContaining(['text-amber-ink', 'text-[13px]', 'font-body-semibold']),
    );
  });

  test('is not colour alone: a decorative 20 dp wifi-off icon leads the words', async () => {
    await render(offline());
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: 'wifi-off', size: 20, weight: 'regular' }),
    ]);
    expect(screen.queryByTestId(anyGlyph)).toBeNull();
  });

  test('the words are one element, announced politely and not as an alert', async () => {
    await render(offline());
    const words = screen.getByTestId('banner-message');
    expect(words.props.accessible).toBe(true);
    expect(words.props.accessibilityRole).toBeUndefined();
    expect(words.props.accessibilityLiveRegion).toBe('polite');
    expect(words).toHaveTextContent(OFFLINE);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('has no action unless one is given', async () => {
    await render(offline());
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('<Banner tone="error"> - danger, an alert and a way out', () => {
  const failed = (props: Record<string, unknown> = {}) => (
    <Banner tone="error" message={ERROR} testID="banner" {...props} />
  );

  test('is the danger tint with the danger ink', async () => {
    await render(failed());
    expect(classesOf('banner')).toContain('bg-danger-tint');
    expect(classesOf('banner')).not.toContain('bg-amber-tint');
    expect(tokens(screen.getByText(ERROR).props.className)).toContain('text-danger');
  });

  test('the words are an alert, one accessibility element', async () => {
    await render(failed());
    const words = screen.getByRole('alert');
    expect(words).toBe(screen.getByTestId('banner-message'));
    expect(words.props.accessible).toBe(true);
    expect(words).toHaveTextContent(ERROR);
  });

  test('is not colour alone: a decorative cloud alert icon leads the words', async () => {
    await render(failed());
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: 'cloud-off', size: 20, weight: 'regular' }),
    ]);
    expect(screen.queryByTestId(anyGlyph)).toBeNull();
  });

  test('the action is an underlined button named by its label, beside the words not inside them', async () => {
    const onPress = jest.fn();
    await render(failed({ action: { label: 'Retry', onPress, testID: 'sync-retry' } }));
    const retry = screen.getByTestId('sync-retry');
    expect(retry).toBe(screen.getByLabelText('Retry'));
    expect(retry.props.accessibilityRole).toBe('button');
    expect(tokens(screen.getByText('Retry').props.className)).toEqual(
      expect.arrayContaining(['underline', 'text-foreground']),
    );
    expect(screen.getByTestId('banner-message')).not.toHaveTextContent('Retry');
    await fireEvent.press(retry);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('the action is a full target that reaches the banner edges instead of fattening it', async () => {
    await render(
      failed({ action: { label: 'Retry', onPress: jest.fn(), testID: 'retry' } }),
    );
    const style = styleOf('retry');
    expect(style.minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
    expect(style.marginVertical).toBe(-8);
  });

  test('a retry that is under way is announced busy and ignores a second press', async () => {
    const onPress = jest.fn();
    await render(
      failed({ action: { label: 'Retry', onPress, testID: 'retry', busy: true } }),
    );
    expect(screen.getByTestId('retry').props.accessibilityState).toMatchObject({
      busy: true,
    });
    await fireEvent.press(screen.getByTestId('retry'));
    expect(onPress).not.toHaveBeenCalled();
  });

  test('the words wrap at the largest text instead of clipping', async () => {
    await render(failed());
    expect(screen.getByText(ERROR).props.numberOfLines).toBeUndefined();
    expect(classesOf('banner-message')).toContain('flex-1');
  });
});

describe('<Banner> colour and ids', () => {
  test('uses semantic classes only', async () => {
    await render(<Banner tone="offline" message={OFFLINE} testID="banner" />);
    for (const token of classesOf('banner')) {
      expect(token).not.toMatch(/\[#|rgb|hsl/);
    }
  });

  test('the icon is in the ink of the words: amber ink for offline, danger for an error', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string) => `colour:${token}`) as never);
    await render(<Banner tone="offline" message={OFFLINE} />);
    expect(glyphsIn().map((glyph) => glyph.color)).toEqual(['colour:amber-ink']);
    await render(<Banner tone="error" message={ERROR} />);
    expect(glyphsIn().map((glyph) => glyph.color)).toEqual(['colour:danger']);
  });

  test('without a testID the nodes carry none', async () => {
    await render(<Banner tone="offline" message={OFFLINE} />);
    expect(screen.queryByTestId('banner-message')).toBeNull();
  });
});
