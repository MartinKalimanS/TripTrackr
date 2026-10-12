/**
 * T522 - contract C5-28 (`Toast`), research D5-14, FR-066, FR-067. The Undo toast over the
 * HeroUI Toast: the `toastSurface` fill and `toastInk` text, ONE action of at least 44 dp in
 * `accentPress`, a 3 dp countdown bar, 16 dp corners and the second lift, announced politely
 * and gone after 5 seconds.
 *
 * The kit's Toast is a plain host node under Jest that carries every prop it was given
 * (test/mocks/heroui-native.tsx; the stand-in mirrors the kit's `status` role and polite
 * live region, read from its source), and `useToast()` of the kit returns a `jest.fn` for
 * `show` and `hide`. So what is asserted is what the adapter ASKED of the kit and the
 * accessibility contract of what it rendered, never the kit's animation.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { liftOf } from '@/theme';

import { TOAST_DURATION_MS, Toast, useToast } from './toast';

jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-color-scheme');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const { useColorScheme } = jest.requireMock('@/hooks/use-color-scheme') as {
  useColorScheme: jest.Mock<'light' | 'dark', []>;
};
const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock; hide: jest.Mock };
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

beforeEach(() => {
  mockAppearance();
  useColorScheme.mockReturnValue('light');
  mockToast.show.mockClear();
  mockToast.hide.mockClear();
});
afterEach(() => jest.restoreAllMocks());

const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const hidden = { includeHiddenElements: true };

/** The props the kit hands a toast component: ids, the stack, and `show` / `hide`. */
function kitProps(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    index: 0,
    total: { value: 1 },
    heights: { value: {} },
    show: jest.fn(),
    hide: jest.fn(),
    ...overrides,
  };
}

/** Drives the hook as a screen would and returns what it asked the kit to show. */
async function shown(options: Record<string, unknown> = {}) {
  let toast: ReturnType<typeof useToast> | undefined;
  function Probe() {
    toast = useToast();
    return null;
  }
  await render(<Probe />);
  const id = toast!.show({
    message: 'Trip deleted',
    action: { label: 'Undo', onPress: jest.fn() },
    ...options,
  });
  const request = mockToast.show.mock.calls.at(-1)?.[0] as {
    component: (props: ReturnType<typeof kitProps>) => React.ReactElement;
    duration: number | 'persistent';
    id?: string;
  };
  return { id, request, toast: toast! };
}

describe('useToast - what a screen asks of the kit', () => {
  test('shows a custom component for 5 seconds, and returns the kit\u2019s id', async () => {
    const { id, request } = await shown();
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(id).toBe('toast-id');
    expect(request.duration).toBe(TOAST_DURATION_MS);
    expect(TOAST_DURATION_MS).toBe(5000);
    expect(typeof request.component).toBe('function');
  });

  test('a duration and an id of the caller\u2019s go to the kit', async () => {
    const { request } = await shown({ durationMs: 8000, id: 'trip-undo' });
    expect(request.duration).toBe(8000);
    expect(request.id).toBe('trip-undo');
  });

  test('hide goes to the kit, with an id or without', async () => {
    const { toast } = await shown();
    toast.hide('t1');
    toast.hide();
    expect(mockToast.hide).toHaveBeenNthCalledWith(1, 't1');
    expect(mockToast.hide).toHaveBeenNthCalledWith(2, undefined);
  });

  test('is the same object between renders, so an effect may depend on it', async () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useToast());
      return null;
    }
    const { rerender } = await render(<Probe />);
    await rerender(<Probe />);
    expect(seen[0]).toBe(seen.at(-1));
  });
});

describe('<Toast> - the Sunrise toast over the kit', () => {
  const body = async (options: Record<string, unknown> = {}, props = kitProps()) => {
    const { request } = await shown(options);
    await render(request.component(props));
    return props;
  };

  test('is announced politely, as a status and not an alert', async () => {
    await body();
    const root = screen.getByTestId('toast-t1');
    expect(root.props.role).toBe('status');
    expect(root.props['aria-live']).toBe('polite');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('sits at the bottom, over the pill, and the kit\u2019s stack props reach the root', async () => {
    const props = await body();
    const root = screen.getByTestId('toast-t1');
    expect(root.props.placement).toBe('bottom');
    expect(root.props.variant).toBe('default');
    expect(root.props.id).toBe('t1');
    expect(root.props.hide).toBe(props.hide);
    expect(root.props.index).toBe(0);
  });

  test('is the toast surface with 16 dp corners and the second lift', async () => {
    await body();
    const root = screen.getByTestId('toast-t1');
    expect(tokens(root.props.className)).toEqual(
      expect.arrayContaining(['bg-toast-surface', 'flex-row', 'items-center']),
    );
    expect(StyleSheet.flatten(root.props.style)).toMatchObject({
      borderRadius: 16,
      borderCurve: 'continuous',
      boxShadow: liftOf('light', 'lift2'),
    });
  });

  test('says its words in the toast ink, 14 / 20, wrapping', async () => {
    await body();
    const words = screen.getByText('Trip deleted');
    expect(tokens(words.props.className)).toEqual(
      expect.arrayContaining(['text-toast-ink', 'text-[14px]', 'flex-1']),
    );
    expect(words.props.numberOfLines).toBeUndefined();
  });

  test('has ONE action: a 48 dp ghost button named by its label, in the accent-press ink', async () => {
    await body();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    const undo = screen.getByLabelText('Undo');
    expect(undo).toBe(buttons[0]);
    expect(undo.props.variant).toBe('ghost');
    expect(undo.props.size).toBe('md');
    expect(tokens(screen.getByText('Undo').props.className)).toEqual(
      expect.arrayContaining(['text-accent-press']),
    );
  });

  test('pressing the action runs it and dismisses the toast', async () => {
    const onPress = jest.fn();
    const props = await body({ action: { label: 'Undo', onPress, testID: 'undo' } });
    await fireEvent.press(screen.getByTestId('undo'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(props.hide).toHaveBeenCalledWith('t1');
  });

  test('a toast with no action is words only', async () => {
    await body({ action: undefined });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Trip deleted')).toBeTruthy();
  });

  test('draws a 3 dp countdown bar that runs the duration of the toast, decoratively', async () => {
    await body();
    const bar = screen.getByTestId('toast-t1-countdown', hidden);
    expect(tokens(bar.props.className)).toEqual(
      expect.arrayContaining(['absolute', 'bottom-0', 'h-[3px]']),
    );
    const fill = bar.children[0] as unknown as { props: Record<string, unknown> };
    expect(tokens(fill.props.className)).toContain('bg-accent-press');
    expect(StyleSheet.flatten(fill.props.style as never)).toHaveProperty('transform');
    expect(bar.props.accessibilityElementsHidden).toBe(true);
    expect(bar.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(bar.props.pointerEvents).toBe('none');
  });

  test('under reduced motion nothing moves: no countdown bar, and the kit animates nothing', async () => {
    mockAppearance({ prefersLessMotion: true });
    await body();
    expect(screen.queryByTestId('toast-t1-countdown', hidden)).toBeNull();
    expect(screen.getByTestId('toast-t1').props.animation).toBe('disable-all');
  });

  test('with motion allowed the kit keeps its own animation', async () => {
    await body();
    expect(screen.getByTestId('toast-t1').props.animation).toBeUndefined();
  });

  test('uses semantic classes only, never a colour literal', async () => {
    await body();
    const all = [
      screen.getByTestId('toast-t1'),
      screen.getByText('Trip deleted'),
      screen.getByText('Undo'),
    ].flatMap((node) => tokens(node.props.className));
    expect(all.some((name) => /\[#|rgb|hsl/.test(name))).toBe(false);
  });

  test('exports the presentational body for a gallery and for tests', () => {
    expect(typeof Toast).toBe('function');
  });
});
