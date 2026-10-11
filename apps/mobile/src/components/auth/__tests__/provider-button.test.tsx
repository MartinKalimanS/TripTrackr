/**
 * `ProviderButton` - the "Continue with Google / Apple" button (feature 004, T446; FR-005,
 * FR-024, FR-025, FR-026, FR-029, FR-030; contract C4-11 "outline social buttons").
 *
 * An OUTLINED control: no fill, a boundary the colour gate measures at 3:1 (FR-024), the
 * provider's logo and its name in words, as wide as the screen's content so the thumb finds
 * it. It is a secondary control (FR-005): only the screen's own action is primary.
 *
 * Both providers are drawn the same size and with the same prominence (App Store Review
 * Guideline 4.8, docs/release/store-readiness.md): one component, one set of classes.
 *
 * Jest renders no styles: classes and props are what is asserted. That the outline draws,
 * and how it looks in four themes, is a device check.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';

import { ProviderButton, ProviderButtonSpacer } from '../provider-button';

// The glyph font is not the subject; which logo is.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = jest.requireActual('react-native');
  return function MockIonicons({ name }: { name: string }) {
    return <Text testID={`icon-${name}`}>{name}</Text>;
  };
});

const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

/** A pressable's own style is a function of its state; the resting one is what is read. */
const resting = (node: { props: { style?: unknown } }) =>
  flat(
    typeof node.props.style === 'function'
      ? (node.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false })
      : node.props.style,
  );

const hidden = { includeHiddenElements: true };

describe('<ProviderButton> - what it says', () => {
  test.each([
    ['google', 'Google', 'google-sign-in'],
    ['apple', 'Apple', 'apple-sign-in'],
  ] as const)(
    '%s: a button named "Continue with %s", the same words visible beside the logo',
    async (provider, name, id) => {
      await render(<ProviderButton provider={provider} onPress={jest.fn()} />);

      const button = screen.getByTestId(id);
      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.accessibilityLabel).toBe(`Continue with ${name}`);
      expect(within(button).getByText(`Continue with ${name}`)).toBeTruthy();
      expect(within(button).getByTestId(`icon-logo-${provider}`, hidden)).toBeTruthy();
    },
  );

  test('presses through to the provider flow', async () => {
    const onPress = jest.fn();
    await render(<ProviderButton provider="google" onPress={onPress} />);
    await fireEvent.press(screen.getByTestId('google-sign-in'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('<ProviderButton> - an outline, secondary control (FR-005, FR-024)', () => {
  test('is outlined with the boundary token, fills nothing and spans the content width', async () => {
    await render(<ProviderButton provider="google" onPress={jest.fn()} />);
    const classes = classesOf(screen.getByTestId('google-sign-in'));

    expect(classes).toEqual(expect.arrayContaining(['border', 'border-border']));
    expect(classes).toContain('self-stretch');
    expect(classes.some((name) => /^bg-/.test(name))).toBe(false);
  });

  test('is not a primary control: it is a bare pressable, not the kit’s Button', async () => {
    await render(<ProviderButton provider="apple" onPress={jest.fn()} />);
    expect(screen.getByTestId('apple-sign-in').props.variant).toBeUndefined();
  });

  test('lays the logo and the words out in one centred row', async () => {
    await render(<ProviderButton provider="google" onPress={jest.fn()} />);
    const button = screen.getByTestId('google-sign-in');
    expect(classesOf(button)).toEqual(
      expect.arrayContaining(['flex-row', 'items-center', 'justify-center']),
    );
    expect(resting(button).justifyContent).toBe('center');
  });

  test('has the platform touch target, growing with the text size (FR-026, FR-029)', async () => {
    await render(<ProviderButton provider="google" onPress={jest.fn()} />);
    expect(
      resting(screen.getByTestId('google-sign-in')).minHeight,
    ).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test('the words wrap at the largest text size instead of clipping (FR-029)', async () => {
    await render(<ProviderButton provider="google" onPress={jest.fn()} />);
    const words = screen.getByText('Continue with Google');
    expect(classesOf(words)).toContain('shrink');
    expect(words.props.numberOfLines).toBeUndefined();
  });

  test('draws Google and Apple identically: same classes, same size, same prominence (Guideline 4.8)', async () => {
    await render(
      <>
        <ProviderButton provider="google" onPress={jest.fn()} />
        <ProviderButton provider="apple" onPress={jest.fn()} />
      </>,
    );
    const google = screen.getByTestId('google-sign-in');
    const apple = screen.getByTestId('apple-sign-in');

    expect(classesOf(google)).toEqual(classesOf(apple));
    expect(resting(google)).toEqual(resting(apple));
  });
});

describe('<ProviderButton> - states in words, not colour alone (FR-025)', () => {
  test('without a handler the provider cannot work yet: disabled, announced unavailable, and named so', async () => {
    await render(<ProviderButton provider="google" />);
    const button = screen.getByTestId('google-sign-in-unavailable');

    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    // The name carries the words, because TalkBack can be set not to read hints.
    expect(button.props.accessibilityLabel).toBe('Continue with Google, coming soon');
    // The visible words are the start of the name (WCAG 2.5.3, label in name).
    expect(within(button).getByText('Continue with Google')).toBeTruthy();
    expect(classesOf(button)).toContain('opacity-disabled');
  });

  test('an unavailable provider does nothing when pressed', async () => {
    await render(<ProviderButton provider="apple" />);
    await fireEvent.press(screen.getByTestId('apple-sign-in-unavailable'));
    // Nothing to assert on but the absence of a throw: there is no handler to call.
    expect(screen.getByTestId('apple-sign-in-unavailable')).toBeTruthy();
  });

  test('its own sign-in in flight: busy, inert, and the words say so', async () => {
    const onPress = jest.fn();
    await render(<ProviderButton provider="google" onPress={onPress} busy />);
    const button = screen.getByTestId('google-sign-in');

    expect(button.props.accessibilityState).toMatchObject({ busy: true });
    // The name does not change while it works; the visible words do.
    expect(button.props.accessibilityLabel).toBe('Continue with Google');
    expect(within(button).getByText('Signing in…')).toBeTruthy();
    expect(within(button).queryByText('Continue with Google')).toBeNull();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    // Busy is not dimmed: the work stays readable.
    expect(classesOf(button)).not.toContain('opacity-disabled');
  });

  test('another sign-in in flight: disabled, dimmed, still in words', async () => {
    const onPress = jest.fn();
    await render(<ProviderButton provider="apple" onPress={onPress} disabled />);
    const button = screen.getByTestId('apple-sign-in');

    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(classesOf(button)).toContain('opacity-disabled');
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('a busy provider is never also disabled: it keeps working while the screen waits', async () => {
    await render(<ProviderButton provider="google" onPress={jest.fn()} busy disabled />);
    const state = screen.getByTestId('google-sign-in').props.accessibilityState;
    expect(state).toMatchObject({ busy: true });
  });

  test('busy has no meaning without a handler: the button is simply unavailable', async () => {
    await render(<ProviderButton provider="google" busy />);
    const state = screen.getByTestId('google-sign-in-unavailable').props
      .accessibilityState;
    expect(state).toMatchObject({ disabled: true, busy: false });
  });
});

describe('<ProviderButtonSpacer>', () => {
  test('holds the button’s height while the platform is being asked, and says nothing', async () => {
    await render(<ProviderButtonSpacer />);
    const spacer = screen.getByTestId('provider-button-spacer', hidden);

    expect(resting(spacer).minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
    expect(spacer.props.accessible).not.toBe(true);
  });
});
