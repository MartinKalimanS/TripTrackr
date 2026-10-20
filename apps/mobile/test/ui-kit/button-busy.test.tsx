/**
 * T417 and T519 - the `Button` adapter beside the REAL kit: a busy button is announced busy
 * and unavailable, ignores presses, shows the kit's own `Spinner` and is NOT dimmed
 * (FR-019; data-model section 6).
 *
 * Feature 004 wrapped the kit's Button and had to cancel its `disabled:element-disabled`
 * dimming with a later class (pinned by `button-class-merge.test.ts`). The Sunrise button is
 * a React Native `Pressable` painted from tokens (C5-15): there is no kit class to cancel,
 * and what remains of the kit is the Spinner and the theme colours. This suite keeps the one
 * check that needs the real kit: that the adapter's spinner is the real `Spinner`, hidden
 * from assistive technology, and that the semantics hold with the real provider mounted.
 *
 * Every other suite sees the stand-in kit; this one swaps the real one back in, with the
 * same Reanimated and worklets doubles `real-render.test.tsx` needs.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));
jest.mock('@/hooks/use-haptics', () => ({
  useHaptics: () => ({ selection: jest.fn(), success: jest.fn(), warning: jest.fn() }),
}));

const { HeroUINativeProvider } = jest.requireActual('heroui-native') as {
  HeroUINativeProvider: React.ComponentType<{
    config?: unknown;
    children?: React.ReactNode;
  }>;
};

// The kit prints a styling banner on mount in development; the app switches it off too.
const CONFIG = { devInfo: { stylingPrinciples: false } };

// Under Jest the kit's `useThemeColor` asks Uniwind for `--color-*` variables the stylesheet
// transform never registered, so the real Spinner's gradient gets no colour and
// react-native-svg warns about it. That is the test environment, not the adapter: only
// that warning is dropped, every other one still prints.
const SVG_COLOUR_WARNING = /is not a valid color or .* is not a valid offset/;
const consoleWarn = console.warn.bind(console);
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (!SVG_COLOUR_WARNING.test(String(args[0]))) consoleWarn(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

function renderButton(props: Record<string, unknown> = {}) {
  return render(
    <HeroUINativeProvider config={CONFIG}>
      <Button accessibilityLabel="Save trip" variant="destructive" {...props}>
        Save
      </Button>
    </HeroUINativeProvider>,
  );
}

const button = () => screen.getByLabelText('Save trip');
const hidden = { includeHiddenElements: true };

describe('the Button adapter beside the real kit (T417, T519)', () => {
  test('idle: not disabled, announced as available, no spinner', async () => {
    await renderButton({ testID: 'save' });
    expect(button().props.accessibilityState).toMatchObject({
      busy: false,
      disabled: false,
    });
    expect(screen.queryByTestId('save-spinner', hidden)).toBeNull();
  });

  test('disabled: announced unavailable, with no spinner', async () => {
    await renderButton({ disabled: true, testID: 'save' });
    expect(button().props.accessibilityState).toMatchObject({
      busy: false,
      disabled: true,
    });
    expect(screen.queryByTestId('save-spinner', hidden)).toBeNull();
  });

  test('busy: announced busy and unavailable, with the real Spinner, hidden from assistive technology', async () => {
    await renderButton({ busy: true, testID: 'save' });
    expect(button().props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
    const spinner = screen.getByTestId('save-spinner', hidden);
    expect(spinner.props.accessibilityElementsHidden).toBe(true);
    expect(spinner.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('busy is not dimmed: no opacity in the style, none among the classes', async () => {
    await renderButton({ busy: true });
    const style = StyleSheet.flatten(button().props.style) as Record<string, unknown>;
    expect(style.opacity).toBeUndefined();
    expect(String(button().props.className ?? '')).not.toMatch(/opacity|disabled/);
  });

  test('busy ignores presses on the real Pressable', async () => {
    const onPress = jest.fn();
    await renderButton({ busy: true, onPress });
    await fireEvent.press(button());
    expect(onPress).not.toHaveBeenCalled();
  });

  test('a caller class reaches the node unchanged: there is no kit class beside it', async () => {
    await renderButton({ busy: true, className: 'self-stretch' });
    expect(button().props.className).toBe('self-stretch');
  });
});
