/**
 * T417 - the `Button` adapter against the REAL kit: a busy button is announced busy and
 * unavailable, ignores presses, and is NOT dimmed (research D4-02 item 4; FR-019).
 *
 * The kit has no busy state. The adapter passes `isDisabled` for both `busy` and
 * `disabled`, because React Native's Pressable replaces `accessibilityState.disabled`
 * with its own `disabled` prop (`Libraries/Components/Pressable/Pressable.js`: a
 * non-null `disabled` wins), so a button the kit still sees as enabled could not be
 * announced unavailable. The price is the kit's `disabled:element-disabled` class, which
 * dims to 50% opacity; the adapter cancels it with `disabled:opacity-100`, written after
 * it. Uniwind resolves two classes that set one property by order
 * (`test/ui-kit/button-class-merge.test.ts`), so the later class wins.
 *
 * Every other suite sees the stand-in kit; this one swaps the real one back in, with the
 * same Reanimated and worklets doubles `real-render.test.tsx` needs. Under Jest
 * `className` is an inert prop on the host node, so what is asserted is the class list
 * the kit hands the Pressable, which is what Uniwind reads on a device.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

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

const classesOf = () =>
  String(screen.getByLabelText('Save trip').props.className ?? '').split(/\s+/);

describe('the Button adapter on the real kit (T417)', () => {
  test('idle: not disabled, not dimmed, announced as available', async () => {
    await renderButton();
    const node = screen.getByLabelText('Save trip');
    expect(node.props.accessibilityState).toMatchObject({ busy: false, disabled: false });
    expect(classesOf()).not.toContain('disabled:element-disabled');
    expect(classesOf()).not.toContain('disabled:opacity-100');
  });

  test('disabled: announced unavailable and dimmed by the kit', async () => {
    await renderButton({ disabled: true });
    const node = screen.getByLabelText('Save trip');
    expect(node.props.accessibilityState).toMatchObject({ busy: false, disabled: true });
    expect(classesOf()).toContain('disabled:element-disabled');
    expect(classesOf()).not.toContain('disabled:opacity-100');
  });

  test('busy: announced busy and unavailable, and the dimming class is cancelled', async () => {
    await renderButton({ busy: true });
    const node = screen.getByLabelText('Save trip');
    expect(node.props.accessibilityState).toMatchObject({ busy: true, disabled: true });

    const classes = classesOf();
    expect(classes).toContain('disabled:element-disabled');
    expect(classes).toContain('disabled:opacity-100');
    // Same property, same weight: the later class wins in Uniwind, so the cancel is last.
    expect(classes.indexOf('disabled:opacity-100')).toBeGreaterThan(
      classes.indexOf('disabled:element-disabled'),
    );
  });

  test('busy ignores presses on the real Pressable', async () => {
    const onPress = jest.fn();
    await renderButton({ busy: true, onPress });
    await fireEvent.press(screen.getByLabelText('Save trip'));
    expect(onPress).not.toHaveBeenCalled();
  });

  test('a caller class that is not ours still comes last', async () => {
    await renderButton({ busy: true, className: 'self-stretch' });
    const classes = classesOf();
    expect(classes[classes.length - 1]).toBe('self-stretch');
  });
});
