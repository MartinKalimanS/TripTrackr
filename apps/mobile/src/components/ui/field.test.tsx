/**
 * T420 / T521 - contracts C4-8 and C5-17 (`Field`), FR-009, FR-024, FR-025, FR-029, FR-030,
 * FR-069, FR-071, review rules 2 and 3.
 *
 * Jest renders the kit's TextField, Label, Input, FieldError and Description as plain host
 * nodes that forward every prop (test/mocks/heroui-native.tsx), with FieldError showing
 * only while the field is invalid and Input following the field's disabled state. So what
 * is asserted is the adapter's accessibility contract on the host nodes and what it ASKS
 * of the kit (classes, state), never real styling.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { createRef } from 'react';
import { StyleSheet, Text, type TextInput } from 'react-native';

import { Colors, MinTouchTarget } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { FocusRing, Radii, TypeRoles } from '@/theme';

import { anyGlyph, glyphNamesIn, glyphsIn } from '../../../test/helpers/icons';
import { Field, fieldMinHeight } from './field';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ...overrides,
  } as AppearanceContext);
}

beforeEach(() => mockAppearance());

const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);

const input = () => screen.getByLabelText('Destination');
const classesOf = (element: { props: { className?: unknown } }) =>
  String(element.props.className ?? '').split(/\s+/);
const styleOf = () =>
  StyleSheet.flatten(input().props.style) as Record<string, number | undefined>;

const renderField = (props: Record<string, unknown> = {}) =>
  render(<Field label="Destination" value="" onChangeText={jest.fn()} {...props} />);

describe('<Field> identity - contract C4-8', () => {
  test('lands testID on the input itself, which is a text input', async () => {
    await renderField({ testID: 'destination' });
    const node = screen.getByTestId('destination');
    expect(node.type).toBe('TextInput');
    expect(node).toBe(input());
  });

  test('hands the input its own ref, so a caller can move focus to it', async () => {
    const ref = createRef<TextInput>();
    await renderField({ testID: 'destination', inputRef: ref });
    expect(ref.current).not.toBeNull();
    expect(ref.current).toHaveProperty('props.testID', 'destination');
  });

  test('puts a label accessory in the label row, after the label and before the input', async () => {
    await renderField({
      testID: 'destination',
      labelAccessory: <Text testID="forgot">Forgot?</Text>,
    });
    const order = screen
      .getAllByText(/Destination|Forgot?/)
      .map((node) => node.props.testID ?? 'label');
    expect(order).toEqual(['label', 'forgot']);
    expect(screen.getByTestId('forgot')).toBeTruthy();
    expect(screen.queryByLabelText('Forgot?')).toBeNull();
  });

  test('shows the label as text and names the input by it', async () => {
    await renderField();
    expect(screen.getByText('Destination')).toBeTruthy();
    expect(input().props.accessibilityLabel).toBe('Destination');
  });

  test('an explicit accessibilityLabel replaces the default', async () => {
    await renderField({ accessibilityLabel: 'Where to' });
    expect(screen.getByLabelText('Where to').props.accessibilityLabel).toBe('Where to');
    expect(screen.queryByLabelText('Destination')).toBeNull();
  });

  test('refuses a blank name (runtime, development)', async () => {
    await expect(renderField({ label: '   ' })).rejects.toThrow(/accessibilityLabel/);
  });

  test('shows the value and reports changes', async () => {
    const onChangeText = jest.fn();
    await renderField({ value: 'Lis', onChangeText });
    expect(input().props.value).toBe('Lis');
    await fireEvent.changeText(input(), 'Lisbon');
    expect(onChangeText).toHaveBeenCalledWith('Lisbon');
  });
});

describe('<Field> error in words - FR-025', () => {
  test('shows the message as text under the input, announced as an alert', async () => {
    await renderField({ error: 'Enter a destination', testID: 'destination' });
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(screen.getByText('Enter a destination')).toBeTruthy();
    expect(alert.props.testID).toBe('destination-error');
  });

  test('the alert is one accessibility element, or its role would not be announced', async () => {
    await renderField({ error: 'Enter a destination' });
    expect(screen.getByRole('alert').props.accessible).toBe(true);
  });

  test('marks the input invalid, so the state is not colour alone', async () => {
    await renderField({ error: 'Enter a destination' });
    expect(input().props['aria-invalid']).toBe(true);
  });

  test('shows no message, and no invalid mark, without an error', async () => {
    await renderField();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input().props['aria-invalid']).toBe(false);
  });

  test('an empty error string is no error', async () => {
    await renderField({ error: '' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input().props['aria-invalid']).toBe(false);
  });

  test('the error comes after the input, and the description after the error', async () => {
    await renderField({ error: 'Enter a destination', description: 'A city or country' });
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('"TextInput"')).toBeGreaterThan(-1);
    expect(tree.indexOf('"TextInput"')).toBeLessThan(tree.indexOf('Enter a destination'));
    expect(tree.indexOf('Enter a destination')).toBeLessThan(
      tree.indexOf('A city or country'),
    );
  });

  test('on Android the boundary the kit makes transparent is drawn again (FR-024)', async () => {
    await renderField();
    expect(classesOf(input())).toContain('android:border-field-border');
  });

  test('while invalid the kit keeps its own danger border instead', async () => {
    await renderField({ error: 'Enter a destination' });
    expect(classesOf(input())).not.toContain('android:border-field-border');
  });
});

describe('<Field> description and required', () => {
  test('shows the description as text', async () => {
    await renderField({ description: 'A city or a country' });
    expect(screen.getByText('A city or a country')).toBeTruthy();
  });

  test('keeps the description neutral beside an error (it is not itself invalid)', async () => {
    await renderField({ description: 'A city or a country', error: 'Enter one' });
    expect(screen.getByText('A city or a country').props.isInvalid).toBe(false);
    expect(screen.getByText('Enter one')).toBeTruthy();
  });

  test('renders nothing but the label as text without a description or an error', async () => {
    await renderField();
    expect(screen.getAllByText(/./)).toHaveLength(1);
  });

  test('asks the kit for the required mark and says so to a screen reader', async () => {
    await renderField({ isRequired: true });
    expect(screen.root?.props.isRequired).toBe(true);
    expect(input().props.accessibilityHint).toBe('Required');
  });

  test('a caller hint wins over the required hint', async () => {
    await renderField({ isRequired: true, accessibilityHint: 'Where you are going' });
    expect(input().props.accessibilityHint).toBe('Where you are going');
  });

  test('is not required, and has no hint, unless asked', async () => {
    await renderField();
    expect(screen.root?.props.isRequired).toBeFalsy();
    expect(input().props.accessibilityHint).toBeUndefined();
  });
});

describe('<Field> passes the TextInput props through unchanged - auth depends on it', () => {
  test('a representative set of auth props reaches the host input', async () => {
    const onSubmitEditing = jest.fn();
    const onBlur = jest.fn();
    const onFocus = jest.fn();
    await renderField({
      testID: 'login-password',
      secureTextEntry: true,
      textContentType: 'password',
      autoComplete: 'current-password',
      autoCapitalize: 'none',
      autoCorrect: false,
      keyboardType: 'email-address',
      returnKeyType: 'go',
      maxLength: 64,
      placeholder: 'At least 8 characters',
      onSubmitEditing,
      onBlur,
      onFocus,
    });
    const host = screen.getByTestId('login-password');
    expect(host.props.secureTextEntry).toBe(true);
    expect(host.props.textContentType).toBe('password');
    expect(host.props.autoComplete).toBe('current-password');
    expect(host.props.autoCapitalize).toBe('none');
    expect(host.props.autoCorrect).toBe(false);
    expect(host.props.keyboardType).toBe('email-address');
    expect(host.props.returnKeyType).toBe('go');
    expect(host.props.maxLength).toBe(64);
    expect(host.props.placeholder).toBe('At least 8 characters');

    await fireEvent(host, 'submitEditing');
    await fireEvent(host, 'blur');
    await fireEvent(host, 'focus');
    expect(onSubmitEditing).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  test('a multiline field starts at the top and has room above and below its text', async () => {
    await renderField({ multiline: true, numberOfLines: 4 });
    expect(input().props.multiline).toBe(true);
    expect(input().props.numberOfLines).toBe(4);
    expect(input().props.textAlignVertical).toBe('top');
    expect(classesOf(input())).toContain('py-3');
  });

  test('a caller textAlignVertical wins', async () => {
    await renderField({ multiline: true, textAlignVertical: 'center' });
    expect(input().props.textAlignVertical).toBe('center');
  });

  test('a single-line field is not given multiline padding', async () => {
    await renderField();
    expect(input().props.multiline).toBeUndefined();
    expect(classesOf(input())).not.toContain('py-3');
  });

  test('editable={false} is the kit disabled state, which the input follows', async () => {
    // The stand-in's Input derives `editable` from the field's disabled state, and the
    // adapter passes no `editable` of its own, so this proves the kit was told.
    await renderField({ editable: false });
    expect(input().props.editable).toBe(false);
  });

  test('is editable by default', async () => {
    await renderField();
    expect(input().props.editable).toBe(true);
  });
});

describe('<Field> largest text - FR-029', () => {
  test('the minimum height is 56 dp at the default size, above the platform floor', () => {
    expect(fieldMinHeight(1)).toBe(56);
    expect(fieldMinHeight(1)).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test('grows with the font scale instead of clipping', () => {
    expect(fieldMinHeight(2)).toBe(fieldMinHeight(1) * 2);
    expect(fieldMinHeight(1.5)).toBe(fieldMinHeight(1) * 1.5);
  });

  test('never shrinks below the floor when the text is made smaller', () => {
    expect(fieldMinHeight(0.8)).toBe(fieldMinHeight(1));
  });

  test('asks the input for that minimum, read live from the appearance', async () => {
    mockAppearance({ fontScale: 2 });
    await renderField();
    expect(styleOf().minHeight).toBe(fieldMinHeight(2));
  });

  test('a multiline field is as tall as the lines it asks for, text and padding', () => {
    // numberOfLines is Android-only in React Native 0.86: iOS would start at one line.
    const lines = (count: number) => count * (TypeRoles.body.lineHeight ?? 24) + 24;
    expect(fieldMinHeight(1, 6)).toBe(lines(6));
    expect(fieldMinHeight(2, 6)).toBe(lines(6) * 2);
    expect(fieldMinHeight(0.8, 6)).toBe(lines(6));
  });

  test('asking for one line never makes a field shorter than the floor', () => {
    expect(fieldMinHeight(1, 1)).toBe(fieldMinHeight(1));
  });

  test('a multiline input asks for its lines, read live from the appearance', async () => {
    mockAppearance({ fontScale: 2 });
    await renderField({ multiline: true, numberOfLines: 6 });
    expect(styleOf().minHeight).toBe(fieldMinHeight(2, 6));
    expect(styleOf().minHeight).toBeGreaterThan(fieldMinHeight(2));
  });

  test('numberOfLines only sizes a multiline field: a single-line one keeps the floor', async () => {
    await renderField({ numberOfLines: 6 });
    expect(styleOf().minHeight).toBe(fieldMinHeight(1));
  });

  test('a multiline field that names no lines keeps the floor', async () => {
    await renderField({ multiline: true });
    expect(styleOf().minHeight).toBe(fieldMinHeight(1));
  });

  test('never caps font scaling on the input or the label', async () => {
    await renderField();
    expect(input().props.maxFontSizeMultiplier).toBeUndefined();
    expect(input().props.allowFontScaling).toBeUndefined();
    expect(screen.getByText('Destination').props.maxFontSizeMultiplier).toBeUndefined();
  });
});

describe('<Field> look - C5-17', () => {
  beforeEach(() => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string) => `colour:${token}`) as never);
  });

  test('the label is above the input: the label role, 14 / 20 semibold in the ink', async () => {
    await renderField();
    const label = screen.getByText('Destination');
    expect(tokens(label.props.className)).toEqual(
      expect.arrayContaining(['text-[14px]', 'font-body-semibold', 'text-foreground']),
    );
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Destination')).toBeLessThan(tree.indexOf('"TextInput"'));
  });

  test('the label stays in the ink while the field is invalid: the words carry the error', async () => {
    await renderField({ error: 'Enter a destination' });
    const label = tokens(screen.getByText('Destination').props.className);
    expect(label).toContain('text-foreground');
    expect(label).not.toContain('text-danger');
  });

  test('the input is a 12 dp continuous corner', async () => {
    await renderField();
    expect(styleOf()).toMatchObject({
      borderRadius: Radii.md,
      borderCurve: 'continuous',
    });
  });

  test('at rest it draws no focus ring and no boundary of its own', async () => {
    await renderField();
    expect(styleOf()).toMatchObject({ outlineWidth: 0 });
    expect(styleOf().borderColor).toBeUndefined();
    expect(styleOf().backgroundColor).toBeUndefined();
  });

  test('focused it is the surface fill inside a 2.5 dp focus ring with a 2 dp gap', async () => {
    await renderField();
    await fireEvent(input(), 'focus');
    expect(styleOf()).toMatchObject({
      backgroundColor: 'colour:surface',
      outlineWidth: FocusRing.width,
      outlineOffset: FocusRing.offset,
      outlineColor: 'colour:focus',
      outlineStyle: 'solid',
    });
    expect(FocusRing.width).toBe(2.5);
    expect(FocusRing.offset).toBe(2);
    await fireEvent(input(), 'blur');
    expect(styleOf()).toMatchObject({ outlineWidth: 0 });
    expect(styleOf().backgroundColor).toBeUndefined();
  });

  test('the caller\u2019s focus and blur handlers still run beside the ring', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await renderField({ onFocus, onBlur });
    await fireEvent(input(), 'focus');
    await fireEvent(input(), 'blur');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  test('invalid it has a 1.5 dp danger boundary, and the ring still shows when focused', async () => {
    await renderField({ error: 'Enter a destination' });
    expect(styleOf()).toMatchObject({
      borderColor: 'colour:danger',
      borderWidth: 1.5,
      outlineWidth: 0,
    });
    await fireEvent(input(), 'focus');
    expect(styleOf()).toMatchObject({
      borderColor: 'colour:danger',
      outlineColor: 'colour:focus',
      outlineWidth: FocusRing.width,
    });
  });

  test('the error is an alert icon and words in the danger ink, in one alert element', async () => {
    await renderField({ error: 'Enter a destination', testID: 'destination' });
    const alert = screen.getByRole('alert');
    expect(alert.props.accessible).toBe(true);
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: 'alert', size: 16, weight: 'regular' }),
    ]);
    expect(screen.queryByTestId(anyGlyph)).toBeNull();
    expect(tokens(screen.getByText('Enter a destination').props.className)).toEqual(
      expect.arrayContaining(['text-[14px]', 'text-danger']),
    );
  });

  test('the helper text has a leading info icon and the muted ink, and no alert role', async () => {
    await renderField({ description: 'A city or a country' });
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: 'info', size: 16, weight: 'regular' }),
    ]);
    expect(tokens(screen.getByText('A city or a country').props.className)).toEqual(
      expect.arrayContaining(['text-[13px]', 'text-muted']),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('an error and a helper show both icons, the error first', async () => {
    await renderField({ error: 'Enter one', description: 'A city or a country' });
    expect(glyphNamesIn()).toEqual(['alert', 'info']);
  });

  test('no icon is drawn for a plain field', async () => {
    await renderField();
    expect(glyphsIn()).toEqual([]);
  });

  test('the error icon is in the danger ink and the helper icon in the muted ink', async () => {
    await renderField({ error: 'Enter one', description: 'A city or a country' });
    const [error, helper] = glyphsIn();
    expect(error.color).toBe('colour:danger');
    expect(helper.color).toBe('colour:muted');
  });
});

describe('<Field> colour - review rule 3', () => {
  test('requests semantic classes only, never a colour literal', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('./field.tsx'), 'utf8') as string;
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\[#/);
  });
});
