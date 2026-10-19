/**
 * T534 - the Home sheet (feature 005; FR-012, FR-017, FR-027, FR-062; contract C5-22;
 * research D5-03): a persistent, non-modal sheet of three detents, moved by a pan on the UI
 * thread, with a handle that is an adjustable control, one settle callback for the camera, a
 * selection haptic per settle and no spring under reduced motion.
 *
 * What the doubles are. Gestures are driven with Gesture Handler's own `fireGestureHandler`
 * (`react-native-gesture-handler/jest-utils`) against the real `GestureDetector`, its native
 * module replaced by the library's `jestSetup`. Reanimated is `test/mocks/reanimated-live.ts`:
 * shared values that persist, an animated style read live (so a test reads `translateY` after
 * a gesture with no re-render, which is also how "no per-frame JS" is shown) and springs that
 * finish only when the suite says so (so "one settle callback, after the spring" is shown).
 * The pan's own callbacks must be worklets: the Babel plugin marks them, and a test reads the
 * mark. Whether 60 frames a second hold over a live globe is T509, on a device.
 *
 * A pan event's `translationY` is positive downward and `velocityY` too; the sheet's own
 * "visible height" grows upward, so a drag of -200 raises it 200 dp.
 */
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { Motion } from '@/theme';

import { Sheet, SheetScrollable, useSheetScroll, type SheetProps } from './sheet';

jest.mock('react-native-worklets', () => require('../../../test/mocks/worklets'));
jest.mock('react-native-reanimated', () =>
  require('../../../test/mocks/reanimated-live'),
);
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    (require('react') as typeof import('react')).useEffect(effect, [effect]),
}));
jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-haptics');

interface Live {
  springs: { kind: string; to: number; config: Record<string, unknown> | undefined }[];
  finish: () => void;
  progress: (value: number) => void;
  running: () => number;
  reset: () => void;
}
const live = (jest.requireMock('react-native-reanimated') as { __live: Live }).__live;
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock;
};

const HEIGHTS = { peek: 212, half: 439, full: 780 } as const;
const sheetSnap = jest.fn();
const onDetentChange = jest.fn();
const onSettle = jest.fn();

function setMotion(prefersLessMotion: boolean) {
  useAppearance.mockReturnValue({
    theme: 'light',
    themeName: 'light',
    prefersMoreContrast: false,
    prefersLessMotion,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ready: true,
  });
}

beforeEach(() => {
  live.reset();
  sheetSnap.mockReset();
  onDetentChange.mockReset();
  onSettle.mockReset();
  useHaptics.mockReturnValue({ sheetSnap });
  setMotion(false);
});

const renderBody = jest.fn(({ detent }: { detent: string }) => (
  <Text testID="body-content">{detent}</Text>
));

function sheet(props: Partial<SheetProps> = {}): ReactElement {
  return (
    <Sheet
      detents={HEIGHTS}
      detent="half"
      onDetentChange={onDetentChange}
      onSettle={onSettle}
      handleLabel="Countries and trips"
      renderBody={renderBody}
      {...props}
    />
  );
}

/** Lets every running spring come to rest, as the UI thread would. */
const finishSprings = () =>
  act(async () => {
    live.finish();
  });

/** Where the sheet is drawn now: its height above the bottom edge, read live. */
function visibleHeight(): number {
  const style = StyleSheet.flatten(screen.getByTestId('home-sheet').props.style);
  const [{ translateY }] = style.transform as [{ translateY: number }];
  return HEIGHTS.full - translateY;
}

interface Drag {
  /** Total translation since the touch began; negative raises the sheet. */
  translationY: number;
  /** Positive is downward, as Gesture Handler reports it. */
  velocityY?: number;
  /** Where the pan activated (the 10 dp or so of slack). Default 0. */
  startedAt?: number;
}

async function drag(
  testId: string,
  { translationY, velocityY = 0, startedAt = 0 }: Drag,
) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(testId), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationY: startedAt },
      { state: State.ACTIVE, translationY: (startedAt + translationY) / 2 },
      { state: State.ACTIVE, translationY },
      { state: State.END, translationY, velocityY },
    ]);
  });
}

const BODY_DRAG = 'home-sheet-body-pan';
const ZONE_DRAG = 'home-sheet-drag';
const HANDLE_DRAG = 'home-sheet-handle-drag';

describe('the sheet at rest', () => {
  test.each([
    ['peek', 212],
    ['half', 439],
    ['full', 780],
  ] as const)(
    'is %s tall at the %s detent, drawn by a transform',
    async (detent, high) => {
      await render(sheet({ detent }));
      expect(visibleHeight()).toBe(high);
      const style = StyleSheet.flatten(screen.getByTestId('home-sheet').props.style);
      expect(style.height).toBeGreaterThanOrEqual(HEIGHTS.full);
      expect(Object.keys(style)).not.toContain('top');
    },
  );

  test('has the contract ids and hands the body its detent', async () => {
    await render(sheet({ detent: 'peek' }));
    expect(screen.getByTestId('home-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('home-sheet-handle')).toBeOnTheScreen();
    expect(screen.getByTestId('home-sheet-body')).toBeOnTheScreen();
    expect(screen.getByTestId('body-content')).toHaveTextContent('peek');
  });

  test('is a 28 dp top corner on the continuous curve, with a hairline and the second lift', async () => {
    await render(sheet());
    const style = StyleSheet.flatten(screen.getByTestId('home-sheet').props.style);
    expect(style).toMatchObject({
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderCurve: 'continuous',
    });
    expect(style.borderTopWidth).toBeGreaterThan(0);
    expect(Array.isArray(style.boxShadow) ? style.boxShadow.length : 0).toBeGreaterThan(
      0,
    );
  });

  test('is non-modal: the overlay passes touches through and the sheet takes its own', async () => {
    await render(sheet());
    const sheetNode = screen.getByTestId('home-sheet');
    expect(sheetNode.props.pointerEvents).toBe('auto');
    expect(screen.getByTestId('home-sheet-overlay').props.pointerEvents).toBe('box-none');
  });

  test('draws a header region under the handle when it is given one', async () => {
    await render(sheet({ header: <Text testID="header-content">Countries</Text> }));
    expect(screen.getByTestId('header-content')).toBeOnTheScreen();
  });
});

describe('the handle', () => {
  test('is a 36 by 5 grabber (32 by 4 on Android) inside a target of at least 96 by 48 dp', async () => {
    await render(sheet());
    const grabber = StyleSheet.flatten(
      screen.getByTestId('home-sheet-grabber').props.style,
    );
    expect(grabber).toMatchObject({ width: 36, height: 5 });
    const target = StyleSheet.flatten(
      screen.getByTestId('home-sheet-handle').props.style,
    );
    expect(target.width).toBeGreaterThanOrEqual(96);
    expect(target.minHeight ?? target.height).toBeGreaterThanOrEqual(48);

    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await screen.unmount();
      await render(sheet());
      expect(
        StyleSheet.flatten(screen.getByTestId('home-sheet-grabber').props.style),
      ).toMatchObject({ width: 32, height: 4 });
    } finally {
      os.restore();
    }
  });

  test('is an adjustable control named for what it opens, whose value is the detent', async () => {
    await render(sheet({ detent: 'half' }));
    const handle = screen.getByTestId('home-sheet-handle');
    expect(handle.props.accessibilityRole).toBe('adjustable');
    expect(handle.props.accessibilityLabel).toBe('Countries and trips');
    expect(handle.props.accessibilityValue).toEqual({ text: 'Half' });
    expect(handle.props.accessibilityActions).toEqual([
      { name: 'increment', label: 'More' },
      { name: 'decrement', label: 'Less' },
    ]);
  });

  test('says Peek and Full too', async () => {
    await render(sheet({ detent: 'peek' }));
    expect(screen.getByTestId('home-sheet-handle').props.accessibilityValue).toEqual({
      text: 'Peek',
    });
    await screen.rerender(sheet({ detent: 'full' }));
    expect(screen.getByTestId('home-sheet-handle').props.accessibilityValue).toEqual({
      text: 'Full',
    });
  });

  test('increment steps up one detent and decrement steps down one, stopping at the ends', async () => {
    await render(sheet({ detent: 'half' }));
    const handle = screen.getByTestId('home-sheet-handle');
    const act1 = (actionName: string) =>
      fireEvent(handle, 'accessibilityAction', { nativeEvent: { actionName } });

    await act1('increment');
    expect(onDetentChange).toHaveBeenLastCalledWith('full');
    await act1('decrement');
    expect(onDetentChange).toHaveBeenLastCalledWith('half');
    await act1('decrement');
    expect(onDetentChange).toHaveBeenLastCalledWith('peek');
    await act1('decrement');
    expect(onDetentChange).toHaveBeenCalledTimes(3);
  });

  test('a step at the end of the range does nothing', async () => {
    await render(sheet({ detent: 'full' }));
    await fireEvent(screen.getByTestId('home-sheet-handle'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onDetentChange).not.toHaveBeenCalled();
    expect(live.springs).toHaveLength(0);
  });

  test('a tap cycles the detents: peek, half, full, then round to peek', async () => {
    await render(sheet({ detent: 'peek' }));
    await fireEvent.press(screen.getByTestId('home-sheet-handle'));
    expect(onDetentChange).toHaveBeenLastCalledWith('half');

    await screen.rerender(sheet({ detent: 'half' }));
    await fireEvent.press(screen.getByTestId('home-sheet-handle'));
    expect(onDetentChange).toHaveBeenLastCalledWith('full');

    await screen.rerender(sheet({ detent: 'full' }));
    await fireEvent.press(screen.getByTestId('home-sheet-handle'));
    expect(onDetentChange).toHaveBeenLastCalledWith('peek');
  });

  test('a tap springs with the sheet spring and settles once', async () => {
    await render(sheet({ detent: 'peek' }));
    await fireEvent.press(screen.getByTestId('home-sheet-handle'));
    expect(live.springs).toEqual([
      expect.objectContaining({ kind: 'spring', to: 439, config: expect.anything() }),
    ]);
    expect(live.springs[0]?.config).toMatchObject({ ...Motion.sheetSpring });
    expect(onSettle).not.toHaveBeenCalled();
    await finishSprings();
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith('half');
  });

  test('can be dragged: the handle and the header are drag zones', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(HANDLE_DRAG, { translationY: -350, velocityY: -1200 });
    await finishSprings();
    expect(onDetentChange).toHaveBeenCalledWith('full');
    await drag(ZONE_DRAG, { translationY: 400, velocityY: 1500 });
    expect(onDetentChange).toHaveBeenLastCalledWith('peek');
  });
});

describe('dragging', () => {
  test('follows the finger, up from half, as a transform on the UI thread', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(BODY_DRAG, { translationY: -100, velocityY: 0 });
    expect(visibleHeight()).toBe(439 + 100);
  });

  test('does not jump when the pan activates: the slack before it is not added', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(BODY_DRAG, { translationY: -112, startedAt: -12 });
    expect(visibleHeight()).toBe(439 + 100);
  });

  test('releases on the nearest detent and tells the parent at once', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(BODY_DRAG, { translationY: -200, velocityY: -300 });
    expect(onDetentChange).toHaveBeenCalledTimes(1);
    expect(onDetentChange).toHaveBeenCalledWith('full');
    expect(live.springs).toHaveLength(1);
    expect(live.springs[0]?.to).toBe(780);
  });

  test('a short drag that stays nearest the starting detent springs back to it', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(BODY_DRAG, { translationY: -40, velocityY: 0 });
    expect(live.springs[0]?.to).toBe(439);
    expect(onDetentChange).toHaveBeenCalledWith('half');
  });

  test('a flick down from half goes to peek; a flick up from peek goes to half', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(BODY_DRAG, { translationY: 60, velocityY: 1800 });
    expect(live.springs.at(-1)?.to).toBe(212);
    await finishSprings();

    await screen.rerender(sheet({ detent: 'peek' }));
    await drag(BODY_DRAG, { translationY: -60, velocityY: -1000 });
    expect(live.springs.at(-1)?.to).toBe(439);
  });

  test('hands the finger velocity to the spring, so the settle continues the motion', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(BODY_DRAG, { translationY: -200, velocityY: -900 });
    const config = live.springs[0]?.config as { velocity?: number };
    expect(config.velocity).toBeCloseTo(900, 5);
  });

  test('rubber-bands beyond full: it yields to the finger and never goes past the limit', async () => {
    await render(sheet({ detent: 'full' }));
    await drag(ZONE_DRAG, { translationY: -120 });
    const pulled = visibleHeight();
    expect(pulled).toBeGreaterThan(780);
    expect(pulled).toBeLessThan(780 + 120);
    await drag(ZONE_DRAG, { translationY: -5000 });
    expect(visibleHeight()).toBeLessThan(780 + 48);
  });

  test('rubber-bands below peek in the same way', async () => {
    await render(sheet({ detent: 'peek' }));
    await drag(ZONE_DRAG, { translationY: 150 });
    const pulled = visibleHeight();
    expect(pulled).toBeLessThan(212);
    expect(pulled).toBeGreaterThan(212 - 150);
  });

  test('a touch while the sheet is still springing takes hold of it where it is', async () => {
    await render(sheet({ detent: 'peek' }));
    await fireEvent.press(screen.getByTestId('home-sheet-handle'));
    expect(live.running()).toBe(1);
    await drag(ZONE_DRAG, { translationY: 0 });
    // The first spring was cancelled (its callback said "not finished"); one more is running.
    expect(onSettle).not.toHaveBeenCalled();
    await finishSprings();
    expect(onSettle).toHaveBeenCalledTimes(1);
  });
});

describe('the settle', () => {
  test('is ONE callback, after the spring finishes, with the detent it came to rest on', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(BODY_DRAG, { translationY: -250, velocityY: -500 });
    expect(onSettle).not.toHaveBeenCalled();
    await finishSprings();
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith('full');
    await finishSprings();
    expect(onSettle).toHaveBeenCalledTimes(1);
  });

  test('plays one selection haptic on the snap, through the sheetSnap name', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(BODY_DRAG, { translationY: -250, velocityY: -500 });
    expect(sheetSnap).not.toHaveBeenCalled();
    await finishSprings();
    expect(sheetSnap).toHaveBeenCalledTimes(1);
  });

  test('is not called on mount: nothing has moved', async () => {
    await render(sheet({ detent: 'half' }));
    await finishSprings();
    expect(onSettle).not.toHaveBeenCalled();
    expect(sheetSnap).not.toHaveBeenCalled();
  });

  test('a parent that changes the detent moves the sheet and hears one settle, no echo', async () => {
    await render(sheet({ detent: 'full' }));
    await screen.rerender(sheet({ detent: 'half' }));
    expect(live.springs).toEqual([expect.objectContaining({ to: 439 })]);
    expect(onDetentChange).not.toHaveBeenCalled();
    await finishSprings();
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith('half');
  });

  test('the parent following a drag with the same detent starts no second spring', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(BODY_DRAG, { translationY: -250, velocityY: -500 });
    await screen.rerender(sheet({ detent: 'full' }));
    expect(live.springs).toHaveLength(1);
  });
});

describe('when the heights change under a mounted sheet', () => {
  const taller = { peek: 212, half: 450, full: 800 } as const;
  const translateY = () => {
    const style = StyleSheet.flatten(screen.getByTestId('home-sheet').props.style);
    return (style.transform as [{ translateY: number }])[0].translateY;
  };

  test('re-seats the sheet on the new height of its detent, with no move reported', async () => {
    await render(sheet({ detent: 'half' }));
    await screen.rerender(sheet({ detent: 'half', detents: taller }));
    expect(translateY()).toBe(800 - 450);
    expect(live.springs).toHaveLength(0);
    expect(onSettle).not.toHaveBeenCalled();
    expect(onDetentChange).not.toHaveBeenCalled();
  });

  test('keeps it on the detent the traveller left it on, not the one the parent last said', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(BODY_DRAG, { translationY: -250, velocityY: -500 });
    await finishSprings();
    await screen.rerender(sheet({ detent: 'full', detents: taller }));
    expect(translateY()).toBe(0);
  });

  test('a new detent and new heights together spring to the new height', async () => {
    await render(sheet({ detent: 'half' }));
    await screen.rerender(sheet({ detent: 'full', detents: taller }));
    expect(live.springs.at(-1)).toEqual(expect.objectContaining({ to: 800 }));
  });

  test('the same heights as a new object change nothing', async () => {
    await render(sheet({ detent: 'half' }));
    await screen.rerender(sheet({ detent: 'half', detents: { ...HEIGHTS } }));
    expect(translateY()).toBe(HEIGHTS.full - HEIGHTS.half);
    expect(live.springs).toHaveLength(0);
  });
});

describe('reduced motion', () => {
  beforeEach(() => setMotion(true));

  test('a tap jumps to the detent with no spring, and still settles once', async () => {
    await render(sheet({ detent: 'peek' }));
    await fireEvent.press(screen.getByTestId('home-sheet-handle'));
    expect(live.springs).toHaveLength(0);
    expect(visibleHeight()).toBe(439);
    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(onSettle).toHaveBeenCalledWith('half');
  });

  test('a drag still follows the finger, and the release jumps with no spring', async () => {
    await render(sheet({ detent: 'half' }));
    await drag(BODY_DRAG, { translationY: -250, velocityY: -500 });
    expect(live.springs).toHaveLength(0);
    expect(visibleHeight()).toBe(780);
    expect(onSettle).toHaveBeenCalledWith('full');
  });

  test('a parent that changes the detent is obeyed at once', async () => {
    await render(sheet({ detent: 'full' }));
    await screen.rerender(sheet({ detent: 'peek' }));
    expect(live.springs).toHaveLength(0);
    expect(visibleHeight()).toBe(212);
  });
});

describe('no per-frame JavaScript', () => {
  test('the pan callbacks are worklets, which run on the UI thread', async () => {
    await render(sheet());
    for (const id of [BODY_DRAG, ZONE_DRAG, HANDLE_DRAG]) {
      const { handlers } = getByGestureTestId(id) as unknown as {
        handlers: { onStart: object; onUpdate: object; onEnd: object };
      };
      for (const callback of [handlers.onStart, handlers.onUpdate, handlers.onEnd]) {
        expect((callback as { __workletHash?: number }).__workletHash).toBeDefined();
      }
    }
  });

  test('a drag renders nothing and calls nothing until the finger lifts', async () => {
    await render(sheet({ detent: 'half' }));
    const renders = renderBody.mock.calls.length;
    await act(async () => {
      fireGestureHandler(getByGestureTestId(BODY_DRAG), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationY: 0 },
        ...Array.from({ length: 30 }, (_, i) => ({
          state: State.ACTIVE,
          translationY: -(i + 1) * 5,
        })),
        { state: State.END, translationY: -150, velocityY: 0 },
      ]);
    });
    expect(visibleHeight()).toBe(439 + 150);
    // One render for the settle's own bookkeeping at most, never one per frame.
    expect(renderBody.mock.calls.length - renders).toBeLessThanOrEqual(2);
    expect(onSettle).not.toHaveBeenCalled();
    expect(sheetSnap).not.toHaveBeenCalled();
  });
});

function ScrollBody() {
  const scroll = useSheetScroll();
  return (
    <SheetScrollable>
      <ScrollView testID="scroller" {...scroll?.scrollProps}>
        <Text>row</Text>
      </ScrollView>
    </SheetScrollable>
  );
}

const scrolled = (y: number) =>
  fireEvent.scroll(screen.getByTestId('scroller'), {
    nativeEvent: { contentOffset: { y } },
  });

describe('the body scroller hands the drag to the sheet', () => {
  const bodyOf = (detent: 'peek' | 'half' | 'full') =>
    sheet({ detent, renderBody: () => <ScrollBody /> });

  test('the scroller is a plain one outside a sheet', async () => {
    expect(useSheetScroll).toBeInstanceOf(Function);
    await render(
      <SheetScrollable>
        <ScrollView testID="scroller" />
      </SheetScrollable>,
    );
    expect(screen.getByTestId('scroller')).toBeOnTheScreen();
  });

  test('scrolls only at the full detent, and bounce and overscroll are off', async () => {
    await render(bodyOf('half'));
    const props = screen.getByTestId('scroller').props;
    expect(props.scrollEnabled).toBe(false);
    expect(props.bounces).toBe(false);
    expect(props.overScrollMode).toBe('never');
    await screen.rerender(bodyOf('full'));
    await finishSprings();
    expect(screen.getByTestId('scroller').props.scrollEnabled).toBe(true);
  });

  test('scrollEnabled changes when a detent settles, not while the sheet is dragged', async () => {
    await render(bodyOf('half'));
    await drag(BODY_DRAG, { translationY: -250, velocityY: -500 });
    expect(screen.getByTestId('scroller').props.scrollEnabled).toBe(false);
    await finishSprings();
    expect(screen.getByTestId('scroller').props.scrollEnabled).toBe(true);
    await drag(BODY_DRAG, { translationY: 300, velocityY: 900 });
    expect(screen.getByTestId('scroller').props.scrollEnabled).toBe(true);
    await finishSprings();
    expect(screen.getByTestId('scroller').props.scrollEnabled).toBe(false);
  });

  test('at the top of the list, a drag down belongs to the sheet', async () => {
    await render(bodyOf('full'));
    await finishSprings();
    await scrolled(0);
    await drag(BODY_DRAG, { translationY: 150, velocityY: 200 });
    expect(visibleHeight()).toBe(780 - 150);
  });

  test('part-way down the list, a drag down is the list\u2019s: the sheet stays', async () => {
    await render(bodyOf('full'));
    await finishSprings();
    await scrolled(240);
    await drag(BODY_DRAG, { translationY: 150, velocityY: 200 });
    expect(visibleHeight()).toBe(780);
    expect(live.springs).toHaveLength(0);
    expect(onDetentChange).not.toHaveBeenCalled();
  });

  test('at full, a drag up is the list\u2019s even at the top', async () => {
    await render(bodyOf('full'));
    await finishSprings();
    await scrolled(0);
    await drag(BODY_DRAG, { translationY: -150, velocityY: -200 });
    expect(visibleHeight()).toBe(780);
    expect(live.springs).toHaveLength(0);
  });

  test('below full, a drag in either direction is the sheet\u2019s, whatever the list says', async () => {
    await render(bodyOf('half'));
    await scrolled(240);
    await drag(BODY_DRAG, { translationY: -100, velocityY: 0 });
    expect(visibleHeight()).toBe(539);
  });

  test('the drag passes to the sheet in the middle of a gesture, when the list reaches its top', async () => {
    await render(bodyOf('full'));
    await finishSprings();
    await scrolled(60);
    const { handlers } = getByGestureTestId(BODY_DRAG) as unknown as {
      handlers: Record<string, (event: unknown) => void>;
    };
    const event = (translationY: number, velocityY = 0) => ({
      translationY,
      velocityY,
      state: State.ACTIVE,
    });
    await act(async () => {
      handlers.onBegin?.(event(0));
      handlers.onStart?.(event(12));
      handlers.onUpdate?.(event(40));
    });
    expect(visibleHeight()).toBe(780);

    await scrolled(0);
    await act(async () => {
      handlers.onUpdate?.(event(70));
      handlers.onUpdate?.(event(130));
    });
    // The sheet took the finger over at 70: 60 dp of travel since, not 130.
    expect(visibleHeight()).toBe(780 - 60);
  });

  test('the drag returns to the list when the sheet is back at full and the finger keeps rising', async () => {
    await render(bodyOf('full'));
    await finishSprings();
    await scrolled(0);
    const { handlers } = getByGestureTestId(BODY_DRAG) as unknown as {
      handlers: Record<string, (event: unknown) => void>;
    };
    const event = (translationY: number) => ({ translationY, velocityY: 0 });
    await act(async () => {
      handlers.onBegin?.(event(0));
      handlers.onStart?.(event(12));
      handlers.onUpdate?.(event(112));
    });
    expect(visibleHeight()).toBe(780 - 100);
    await act(async () => {
      handlers.onUpdate?.(event(12));
      handlers.onUpdate?.(event(-60));
    });
    expect(visibleHeight()).toBe(780);
  });

  test('a touch in the last dp of the spring up to full leaves it running: the settle comes and the list scrolls', async () => {
    await render(bodyOf('half'));
    await drag(BODY_DRAG, { translationY: -250, velocityY: -500 });
    await act(async () => {
      live.progress(779.8);
    });
    await drag(BODY_DRAG, { translationY: -30, velocityY: -100 });
    expect(live.running()).toBe(1);
    await finishSprings();
    expect(onSettle).toHaveBeenCalledWith('full');
    expect(screen.getByTestId('scroller').props.scrollEnabled).toBe(true);
  });
});

describe('the back button on Android', () => {
  let handlers: (() => boolean)[];
  let removed: jest.Mock;
  let os: ReturnType<typeof jest.replaceProperty>;

  beforeEach(() => {
    handlers = [];
    removed = jest.fn();
    os = jest.replaceProperty(Platform, 'OS', 'android');
    const listen = (_event: string, handler: () => boolean) => {
      handlers.push(handler);
      return { remove: removed };
    };
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation(listen as unknown as typeof BackHandler.addEventListener);
  });
  afterEach(() => {
    os.restore();
    jest.restoreAllMocks();
  });

  const press = () => handlers.at(-1)?.();

  test('lowers full to half, then half to peek, and leaves peek to the route', async () => {
    await render(sheet({ detent: 'full' }));
    let result: boolean | undefined;
    await act(async () => {
      result = press();
    });
    expect(result).toBe(true);
    expect(onDetentChange).toHaveBeenLastCalledWith('half');
    expect(live.springs.at(-1)?.to).toBe(439);

    await screen.rerender(sheet({ detent: 'half' }));
    await act(async () => {
      result = press();
    });
    expect(result).toBe(true);
    expect(onDetentChange).toHaveBeenLastCalledWith('peek');

    await screen.rerender(sheet({ detent: 'peek' }));
    await act(async () => {
      result = press();
    });
    expect(result).toBe(false);
    expect(onDetentChange).toHaveBeenCalledTimes(2);
  });

  test('steps from the detent the sheet is going to, even before the parent has caught up', async () => {
    await render(sheet({ detent: 'full' }));
    await act(async () => {
      press();
    });
    await act(async () => {
      press();
    });
    expect(onDetentChange.mock.calls.map(([detent]) => detent)).toEqual(['half', 'peek']);
  });

  test('stops listening when the screen loses focus or goes away', async () => {
    await render(sheet({ detent: 'full' }));
    expect(handlers).toHaveLength(1);
    await screen.unmount();
    expect(removed).toHaveBeenCalledTimes(1);
  });

  test('can be switched off, for a sheet that is not the front-most thing on screen', async () => {
    await render(sheet({ detent: 'full', handleBack: false }));
    expect(handlers).toHaveLength(0);
  });
});

describe('the back button on iOS', () => {
  test('is not listened for: the platform has none', async () => {
    const spy = jest.spyOn(BackHandler, 'addEventListener');
    await render(sheet({ detent: 'full' }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
