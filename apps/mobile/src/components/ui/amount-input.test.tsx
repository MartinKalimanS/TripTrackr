/**
 * F6 - `AmountInput`, the amount-first figure of Add expense (add-expense.png; UI-SPEC 9.1):
 * display ~56, tabular, a decimal keypad, the symbol before it, words and an icon for a
 * refusal. The amount stays the string the traveller typed.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { StyleSheet } from 'react-native';

import { PaletteNames, Palettes } from '@/theme';

import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import {
  AMOUNT_LINE_HEIGHT,
  AMOUNT_SIZE,
  AMOUNT_TRACKING,
  AmountInput,
} from './amount-input';

afterEach(() => jest.restoreAllMocks());

const flat = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

describe('<AmountInput>', () => {
  test('is a 56 / 60 figure, tabular, tracked -.03em, centred, one line, on a decimal keypad', async () => {
    await render(
      <AmountInput testID="amt" symbol="€" value="24.50" onChangeText={jest.fn()} />,
    );

    const input = screen.getByTestId('amt');
    expect(flat(input)).toMatchObject({
      fontSize: 56,
      lineHeight: 60,
      letterSpacing: AMOUNT_TRACKING,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    });
    expect(AMOUNT_SIZE).toBe(56);
    expect(AMOUNT_LINE_HEIGHT).toBe(60);
    expect(AMOUNT_TRACKING).toBeCloseTo(-1.68);
    expect(input.props.keyboardType).toBe('decimal-pad');
    expect(input.props.numberOfLines).toBe(1);
    expect(String(input.props.className)).toContain('font-display-bold');
  });

  test('holds the figure to 1.3 times the text size (the numeral rule)', async () => {
    await render(
      <AmountInput testID="amt" symbol="€" value="" onChangeText={jest.fn()} />,
    );
    expect(screen.getByTestId('amt').props.maxFontSizeMultiplier).toBe(1.3);
  });

  test('is named "Amount" and reports exactly the text typed, as a string', async () => {
    const onChangeText = jest.fn();
    await render(
      <AmountInput testID="amt" symbol="€" value="" onChangeText={onChangeText} />,
    );

    const input = screen.getByTestId('amt');
    expect(input.props.accessibilityLabel).toBe('Amount');
    expect(screen.getByLabelText('Amount')).toBe(input);
    await fireEvent.changeText(input, '5,50');
    expect(onChangeText).toHaveBeenCalledWith('5,50');
  });

  test('shows the symbol before the figure, decorative, and none when there is none', async () => {
    await render(
      <AmountInput testID="amt" symbol="€" value="1" onChangeText={jest.fn()} />,
    );
    const symbol = screen.getByText('€', { includeHiddenElements: true });
    expect(symbol.props.accessibilityElementsHidden).toBe(true);
    await screen.unmount();

    await render(
      <AmountInput testID="amt" symbol="" value="1" onChangeText={jest.fn()} />,
    );
    expect(screen.queryByText('€')).toBeNull();
  });

  test('a refusal is words and an icon under the figure, and the input is invalid', async () => {
    await render(
      <AmountInput
        testID="amt"
        symbol="€"
        value="x"
        onChangeText={jest.fn()}
        error="Enter an amount, like 12.50 or 12,50."
      />,
    );

    expect(screen.getByTestId('amt').props['aria-invalid']).toBe(true);
    const words = screen.getByTestId('amt-error');
    expect(words.props.accessibilityRole).toBe('alert');
    expect(words).toHaveTextContent('Enter an amount, like 12.50 or 12,50.');
  });

  test('no error, no alert', async () => {
    await render(
      <AmountInput testID="amt" symbol="€" value="1" onChangeText={jest.fn()} />,
    );
    expect(screen.getByTestId('amt').props['aria-invalid']).toBe(false);
    expect(screen.queryByTestId('amt-error')).toBeNull();
  });

  test('passes autofocus and the placeholder to the input', async () => {
    await render(
      <AmountInput
        testID="amt"
        symbol="€"
        value=""
        placeholder="12.50"
        autoFocus
        onChangeText={jest.fn()}
      />,
    );
    expect(screen.getByTestId('amt').props.autoFocus).toBe(true);
    expect(screen.getByTestId('amt').props.placeholder).toBe('12.50');
  });

  test('has no colour literal: the source asks the theme', () => {
    const source = readFileSync(require.resolve('./amount-input'), 'utf8');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});

describe.each(PaletteNames)('<AmountInput> colours in %s', (theme) => {
  beforeEach(() => mockThemeColors(theme));

  test('caret and selection are the focus colour, the placeholder the subtle ink', async () => {
    await render(
      <AmountInput testID="amt" symbol="€" value="" onChangeText={jest.fn()} />,
    );
    const input = screen.getByTestId('amt');
    expect(input.props.selectionColor).toBe(asCss(Palettes[theme].focus));
    expect(input.props.cursorColor).toBe(asCss(Palettes[theme].focus));
    expect(input.props.placeholderTextColor).toBe(asCss(Palettes[theme].subtle));
  });
});
