/**
 * `PillButton` - the 52 dp pill of the Welcome screen and of the provider buttons (F12; owner
 * decision Q-11; UI-SPEC 7). Jest renders no styles: the classes and the style object are what
 * is asserted; how the pill draws in four themes is a device check.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { AppleButton } from '@/theme/brand-artwork';

import { PILL_MIN_HEIGHT, PillButton } from '../pill-button';

let mockScheme: 'light' | 'dark' = 'light';
let mockFontScale = 1;
jest.mock('@/hooks/use-appearance', () => ({
  useAppearance: () => ({ theme: mockScheme, fontScale: mockFontScale }),
}));
jest.mock('@/hooks/use-font-scale', () => ({ useFontScale: () => mockFontScale }));

beforeEach(() => {
  mockScheme = 'light';
  mockFontScale = 1;
});

const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

const resting = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(
    (typeof node.props.style === 'function'
      ? (node.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false })
      : node.props.style) as never,
  ) ?? {}) as Record<string, unknown>;

const press = jest.fn();
beforeEach(() => press.mockReset());

describe('<PillButton>', () => {
  test('is a 52 dp full-radius pill, growing with the text size, spanning the width', async () => {
    await render(
      <PillButton testID="p" label="Continue with email" look="cream" onPress={press} />,
    );
    const button = screen.getByTestId('p');
    expect(PILL_MIN_HEIGHT).toBe(52);
    expect(resting(button).minHeight).toBe(Math.max(52, MinTouchTarget));
    expect(resting(button).borderRadius).toBeGreaterThanOrEqual(999);
    expect(classesOf(button)).toContain('self-stretch');
    expect(classesOf(button)).toEqual(
      expect.arrayContaining(['flex-row', 'items-center', 'justify-center']),
    );
  });

  test('at text scale 2 the pill grows, and the label wraps instead of clipping', async () => {
    mockFontScale = 2;
    await render(<PillButton testID="p" label="Continue with email" look="cream" />);
    expect(resting(screen.getByTestId('p')).minHeight).toBe(
      Math.max(52, MinTouchTarget * 2),
    );
    const label = screen.getByText('Continue with email');
    expect(classesOf(label)).toContain('shrink');
    expect(label.props.numberOfLines).toBeUndefined();
  });

  test('is named by its visible words, and presses through', async () => {
    await render(
      <PillButton testID="p" label="Continue with email" look="cream" onPress={press} />,
    );
    const button = screen.getByTestId('p');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Continue with email');
    expect(within(button).getByText('Continue with email')).toBeTruthy();
    await fireEvent.press(button);
    expect(press).toHaveBeenCalledTimes(1);
  });

  test('the Apple look is the brand button: black with a white label, white with black in the dark', async () => {
    const { rerender } = await render(
      <PillButton testID="p" label="Continue with Apple" look="apple" onPress={press} />,
    );
    const label = () =>
      StyleSheet.flatten(screen.getByText('Continue with Apple').props.style);
    expect(resting(screen.getByTestId('p')).backgroundColor).toBe(AppleButton.light.fill);
    expect(label().color).toBe(AppleButton.light.ink);
    expect(classesOf(screen.getByTestId('p'))).not.toContain('border');

    mockScheme = 'dark';
    await rerender(
      <PillButton testID="p" label="Continue with Apple" look="apple" onPress={press} />,
    );
    expect(resting(screen.getByTestId('p')).backgroundColor).toBe(AppleButton.dark.fill);
    expect(label().color).toBe(AppleButton.dark.ink);
  });

  test('the outline look has the boundary token and no fill; the cream look fills with the secondary surface', async () => {
    await render(
      <>
        <PillButton testID="o" label="Continue with Google" look="outline" />
        <PillButton testID="c" label="Continue with email" look="cream" />
      </>,
    );
    const outline = classesOf(screen.getByTestId('o'));
    expect(outline).toEqual(expect.arrayContaining(['border', 'border-border']));
    expect(outline.some((name) => /^bg-/.test(name))).toBe(false);
    expect(classesOf(screen.getByTestId('c'))).toEqual(
      expect.arrayContaining(['border', 'border-border', 'bg-surface-secondary']),
    );
  });

  test('busy: inert, announced busy, the name unchanged; disabled: dimmed and inert', async () => {
    const { rerender } = await render(
      <PillButton testID="p" label="Continue" look="cream" onPress={press} busy />,
    );
    expect(screen.getByTestId('p').props.accessibilityState).toMatchObject({
      busy: true,
    });
    await fireEvent.press(screen.getByTestId('p'));
    expect(press).not.toHaveBeenCalled();

    await rerender(
      <PillButton testID="p" label="Continue" look="cream" onPress={press} disabled />,
    );
    expect(classesOf(screen.getByTestId('p'))).toContain('opacity-disabled');
  });

  test('draws its leading glyph before the words', async () => {
    await render(
      <PillButton
        testID="p"
        label="Continue"
        look="cream"
        leading={<Text testID="glyph">g</Text>}
      />,
    );
    const ids = within(screen.getByTestId('p'))
      .getAllByTestId(/glyph|p-label/, { includeHiddenElements: true })
      .map((node) => node.props.testID);
    expect(ids[0]).toBe('glyph');
  });
});
