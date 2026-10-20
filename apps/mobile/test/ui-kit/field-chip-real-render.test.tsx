/**
 * T420 / T421 - the `Field`, `Chip`, `ChipGroup` and `StatusChip` adapters over the REAL
 * `heroui-native` under Jest (research D4-13), once.
 *
 * Every adapter suite sees the shared stand-in (test/mocks/heroui-native.tsx). This one
 * puts the real kit back so the claims the stand-in makes for these adapters are checked
 * against the real thing: the input is the host `TextInput` and carries `testID` and the
 * invalid mark, the kit's FieldError appears only while invalid and is an alert, a chip's
 * role, name and state reach its pressable although the kit sets none, and the kit's
 * children handling (an icon beside a label) renders. Styling is not asserted: Jest has
 * no stylesheet, so it is a device check.
 *
 * Reanimated and worklets need their full doubles here, as in `real-render.test.tsx`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';
import { StyleSheet } from 'react-native';

import { Chip, ChipGroup, StatusChip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));

const { HeroUINativeProvider } = jest.requireActual<typeof HeroUI>('heroui-native');

// The kit prints a styling banner on mount in development; the app switches it off too.
const CONFIG = { devInfo: { stylingPrinciples: false } };

const renderKit = (ui: React.ReactElement) =>
  render(<HeroUINativeProvider config={CONFIG}>{ui}</HeroUINativeProvider>);

describe('Field over the real kit', () => {
  const field = (props: Record<string, unknown> = {}) => (
    <Field
      label="Destination"
      value="Lis"
      onChangeText={jest.fn()}
      testID="destination"
      {...props}
    />
  );

  test('the input is the host and carries the identity, value and name', async () => {
    const onChangeText = jest.fn();
    await renderKit(
      field({ onChangeText, placeholder: 'Where to?', keyboardType: 'email-address' }),
    );

    const input = screen.getByTestId('destination');
    expect(input.type).toBe('TextInput');
    expect(input.props.accessibilityLabel).toBe('Destination');
    expect(input.props.value).toBe('Lis');
    expect(input.props.placeholder).toBe('Where to?');
    expect(input.props.keyboardType).toBe('email-address');
    expect(input.props.editable).toBe(true);
    expect(input.props['aria-invalid']).toBe(false);
    expect(screen.getByText('Destination')).toBeTruthy();

    await fireEvent.changeText(input, 'Lisbon');
    expect(onChangeText).toHaveBeenCalledWith('Lisbon');
  });

  test('the error is words in an alert only while there is one', async () => {
    const { rerender } = await renderKit(field());
    expect(screen.queryByRole('alert')).toBeNull();

    await rerender(
      <HeroUINativeProvider config={CONFIG}>
        {field({ error: 'Enter a destination' })}
      </HeroUINativeProvider>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Enter a destination')).toBeTruthy();
    expect(screen.getByTestId('destination-error')).toBe(screen.getByRole('alert'));
    expect(screen.getByTestId('destination').props['aria-invalid']).toBe(true);
  });

  test('editable={false} is the kit disabled state and the description stays', async () => {
    await renderKit(field({ editable: false, description: 'A city or a country' }));
    expect(screen.getByTestId('destination').props.editable).toBe(false);
    expect(screen.getByText('A city or a country')).toBeTruthy();
  });

  test('Sunrise: the label text wears our classes after the kit\u2019s, and the focus ring reaches the real input', async () => {
    await renderKit(field({ error: 'Enter a destination', description: 'A city' }));
    const classes = String(screen.getByText('Destination').props.className)
      .split(/\s+/)
      .filter(Boolean);
    expect(classes).toEqual(
      expect.arrayContaining(['label__text', 'text-[14px]', 'font-body-semibold']),
    );
    expect(classes.indexOf('text-[14px]')).toBeGreaterThan(
      classes.indexOf('label__text'),
    );
    expect(classes).not.toContain('label__text--is-invalid-colour');

    const input = screen.getByTestId('destination');
    expect(StyleSheet.flatten(input.props.style)).toMatchObject({
      borderRadius: 12,
      borderWidth: 1.5,
      outlineWidth: 0,
    });
    await fireEvent(input, 'focus');
    expect(
      StyleSheet.flatten(screen.getByTestId('destination').props.style),
    ).toMatchObject({
      outlineWidth: 2.5,
      outlineOffset: 2,
      outlineStyle: 'solid',
    });
    expect(screen.getByTestId('destination-error')).toHaveTextContent(
      'Enter a destination',
    );
    expect(screen.getByText('A city')).toBeTruthy();
  });

  test('a required field shows the asterisk and the hint', async () => {
    await renderKit(field({ isRequired: true }));
    expect(screen.getByTestId('destination').props.accessibilityHint).toBe('Required');
    expect(screen.getByText(/\*/)).toBeTruthy();
  });
});

describe('Chip, ChipGroup and StatusChip over the real kit', () => {
  test('a chip gives the kit its role, name and state and presses', async () => {
    const onPress = jest.fn();
    await renderKit(
      <Chip
        label="EUR"
        selected
        accessibilityLabel="Euro"
        testID="currency-EUR"
        onPress={onPress}
      />,
    );
    const host = screen.getByTestId('currency-EUR');
    expect(host.props.accessibilityRole).toBe('button');
    expect(host.props.accessibilityLabel).toBe('Euro');
    expect(host.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('EUR')).toBeTruthy();
    expect(
      screen.getByTestId('currency-EUR-check', { includeHiddenElements: true }),
    ).toBeTruthy();
    await fireEvent.press(host);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a disabled chip is announced unavailable and does not press', async () => {
    const onPress = jest.fn();
    await renderKit(
      <Chip
        label="EUR"
        disabled
        accessibilityLabel="Euro"
        testID="chip"
        onPress={onPress}
      />,
    );
    expect(screen.getByTestId('chip').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByTestId('chip'));
    expect(onPress).not.toHaveBeenCalled();
  });

  test('a group keeps the radio contract of PillGroup', async () => {
    const onSelect = jest.fn();
    await renderKit(
      <ChipGroup
        selectedKey="EUR"
        onSelect={onSelect}
        scroll
        testID="currency-group"
        options={[
          {
            key: 'EUR',
            label: 'EUR',
            testID: 'currency-EUR',
            accessibilityLabel: 'Euro',
          },
          {
            key: 'USD',
            label: 'USD',
            testID: 'currency-USD',
            accessibilityLabel: 'US dollar',
          },
        ]}
      />,
    );
    // The container is deliberately not an accessibility element (its chips must stay
    // reachable one by one), so it is found by id and not by role.
    expect(screen.getByTestId('currency-group').props.accessibilityRole).toBe(
      'radiogroup',
    );
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByTestId('currency-EUR').props.accessibilityState).toEqual({
      selected: true,
      checked: true,
    });
    expect(screen.getByTestId('currency-USD').props.accessibilityState).toEqual({
      selected: false,
      checked: false,
    });
    await fireEvent.press(screen.getByTestId('currency-USD'));
    expect(onSelect).toHaveBeenCalledWith('USD');
  });

  test('a status chip is a text node named "Status: ..." with an icon and the word', async () => {
    await renderKit(<StatusChip status="planning" />);
    const host = screen.getByTestId('status-pill-planning');
    expect(host.props.accessibilityRole).toBe('text');
    expect(host.props.accessibilityLabel).toBe('Status: Planning');
    expect(screen.getByText('Planning')).toBeTruthy();
    expect(host.children).toHaveLength(2);
  });
});
