/**
 * T523 - `StampIn`, the landing of a new stamp (feature 005; FR-060, FR-061, FR-073; contract
 * C5-9; research D5-14): scale 1.6 to 1 and a turn from -14 degrees to the stamp's own tilt in
 * `Motion.stampLandMs`, then the heavy haptic at the instant it lands. Under reduced motion,
 * and when the caller says it has landed before, the stamp simply appears: no animation, no
 * timer, no haptic.
 *
 * Reanimated is replaced here by a double that keeps what the layout animation is built from
 * (`Keyframe` definitions and their duration), because Jest has no worklets runtime; the real
 * `Keyframe` API was read in `react-native-reanimated/src/layoutReanimation`. The thud's timer
 * is captured instead of faked: the landing delay is the only `setTimeout` the component sets,
 * so a test sees it scheduled, fires it by hand, and sees it cleared (Jest's fake clock and
 * Testing Library's async render do not coexist across tests here).
 */
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { Motion } from '@/theme';

import { StampIn } from './stamp-in';

jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-haptics');
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native') as typeof import('react-native');
  class MockKeyframe {
    definitions: unknown;
    durationMs: number | undefined;
    delayMs: number | undefined;
    constructor(definitions: unknown) {
      this.definitions = definitions;
    }
    duration(ms: number) {
      this.durationMs = ms;
      return this;
    }
    delay(ms: number) {
      this.delayMs = ms;
      return this;
    }
  }
  return {
    __esModule: true,
    default: { View },
    Keyframe: MockKeyframe,
    Easing: { out: (easing: unknown) => ({ out: easing }), cubic: 'cubic' },
  };
});

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock;
};
const stamp = jest.fn();

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

interface Entering {
  definitions: {
    from: { transform: Record<string, number | string>[]; opacity: number };
    to: {
      transform: Record<string, number | string>[];
      opacity: number;
      easing: unknown;
    };
  };
  durationMs: number;
  delayMs: number | undefined;
}

const entering = () =>
  screen.getByTestId('stamp-in').props.entering as Entering | undefined;

/** The landing timers the component set and cleared; every other timer passes through. */
interface Landing {
  scheduled: { callback: () => void; id: number; ms: number }[];
  cleared: number[];
}
let landing: Landing;

beforeEach(() => {
  landing = { scheduled: [], cleared: [] };
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: () => void,
    ms?: number,
    ...rest: unknown[]
  ) => {
    // A landing is due at its own duration plus the wait of its slot, under a second.
    if (ms === undefined || ms < Motion.stampLandMs || ms >= 1_000) {
      return realSet(callback, ms, ...rest);
    }
    const id = 9_000 + landing.scheduled.length;
    landing.scheduled.push({ callback, id, ms });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);
  jest.spyOn(globalThis, 'clearTimeout').mockImplementation(((id?: number) => {
    if (typeof id === 'number' && id >= 9_000) landing.cleared.push(id);
    else realClear(id);
  }) as unknown as typeof clearTimeout);
  stamp.mockReset();
  useHaptics.mockReturnValue({ stamp });
  setMotion(false);
});
afterEach(() => jest.restoreAllMocks());

describe('StampIn - the landing', () => {
  test('is a keyframe animation of scale 1.6 to 1 in the landing budget', async () => {
    await render(
      <StampIn tiltDeg={0}>
        <Text>stamp</Text>
      </StampIn>,
    );
    const animation = entering();
    expect(animation?.durationMs).toBe(Motion.stampLandMs);
    expect(Motion.stampLandMs).toBeGreaterThanOrEqual(180);
    expect(Motion.stampLandMs).toBeLessThanOrEqual(220);
    expect(animation?.definitions.from.transform[0]).toEqual({
      scale: Motion.stampScaleFrom,
    });
    expect(animation?.definitions.to.transform[0]).toEqual({ scale: 1 });
    expect(Motion.stampScaleFrom).toBe(1.6);
  });

  test('turns from -14 degrees to the stamp\u2019s own tilt (the child already holds the tilt)', async () => {
    await render(
      <StampIn tiltDeg={5}>
        <Text>stamp</Text>
      </StampIn>,
    );
    const { from, to } = entering()?.definitions ?? {};
    // The child rotates by +5, so the wrapper starts at -14 - 5 and ends at 0: -14 in total.
    expect(from?.transform[1]).toEqual({ rotate: '-19deg' });
    expect(to?.transform[1]).toEqual({ rotate: '0deg' });
  });

  test('fades in while it lands and eases out', async () => {
    await render(
      <StampIn tiltDeg={0}>
        <Text>stamp</Text>
      </StampIn>,
    );
    const { from, to } = entering()?.definitions ?? {};
    expect(from?.opacity).toBe(0);
    expect(to?.opacity).toBe(1);
    expect(to?.easing).toEqual({ out: 'cubic' });
  });

  test('animates nothing but transform and opacity (FR-022)', async () => {
    await render(
      <StampIn tiltDeg={2}>
        <Text>stamp</Text>
      </StampIn>,
    );
    const { from, to } = entering()?.definitions ?? {};
    expect(Object.keys(from ?? {}).sort()).toEqual(['opacity', 'transform']);
    expect(Object.keys(to ?? {}).sort()).toEqual(['easing', 'opacity', 'transform']);
  });

  test('renders its child, and a caller style and testID', async () => {
    await render(
      <StampIn tiltDeg={0} testID="stamp-in-PT" style={{ margin: 4 }}>
        <Text>the stamp</Text>
      </StampIn>,
    );
    expect(screen.getByText('the stamp')).toBeOnTheScreen();
    expect(screen.getByTestId('stamp-in-PT').props.style).toEqual({ margin: 4 });
  });
});

describe('StampIn - landing after another stamp (delayMs)', () => {
  test('a stamp with no wait adds no delay to the keyframe and thuds when it lands', async () => {
    await render(
      <StampIn tiltDeg={0}>
        <Text>stamp</Text>
      </StampIn>,
    );
    expect(entering()?.delayMs).toBeUndefined();
    expect(landing.scheduled.map(({ ms }) => ms)).toEqual([Motion.stampLandMs]);
  });

  test('waits its turn: the keyframe starts later and the thud is due when it lands', async () => {
    await render(
      <StampIn tiltDeg={0} delayMs={240}>
        <Text>stamp</Text>
      </StampIn>,
    );
    expect(entering()?.delayMs).toBe(240);
    expect(entering()?.durationMs).toBe(Motion.stampLandMs);
    expect(landing.scheduled.map(({ ms }) => ms)).toEqual([Motion.stampLandMs + 240]);
    landing.scheduled[0].callback();
    expect(stamp).toHaveBeenCalledTimes(1);
  });

  test('a wait changes nothing under reduced motion: no animation, no timer, no haptic', async () => {
    setMotion(true);
    await render(
      <StampIn tiltDeg={0} delayMs={240}>
        <Text>stamp</Text>
      </StampIn>,
    );
    expect(entering()).toBeUndefined();
    expect(landing.scheduled).toHaveLength(0);
    expect(stamp).not.toHaveBeenCalled();
  });

  test('a wait changes nothing when it has landed before (play is false)', async () => {
    await render(
      <StampIn tiltDeg={0} delayMs={240} play={false}>
        <Text>stamp</Text>
      </StampIn>,
    );
    expect(entering()).toBeUndefined();
    expect(landing.scheduled).toHaveLength(0);
  });
});

describe('StampIn - the thud', () => {
  test('schedules the heavy haptic for the moment it lands, and plays it once', async () => {
    await render(
      <StampIn tiltDeg={0}>
        <Text>stamp</Text>
      </StampIn>,
    );
    expect(landing.scheduled).toHaveLength(1);
    expect(stamp).not.toHaveBeenCalled();
    landing.scheduled[0].callback();
    expect(stamp).toHaveBeenCalledTimes(1);
  });

  test('a stamp that goes away before it lands clears its timer: it never thuds', async () => {
    const view = await render(
      <StampIn tiltDeg={0}>
        <Text>stamp</Text>
      </StampIn>,
    );
    const [{ id }] = landing.scheduled;
    // The stamp is taken out of the tree (the root stays): React clears its effect.
    await view.rerender(<Text>gone</Text>);
    expect(landing.cleared).toEqual([id]);
    expect(stamp).not.toHaveBeenCalled();
  });

  test('a re-render while it lands neither restarts nor doubles the thud', async () => {
    const view = await render(
      <StampIn tiltDeg={0}>
        <Text>stamp</Text>
      </StampIn>,
    );
    await view.rerender(
      <StampIn tiltDeg={0}>
        <Text>stamp again</Text>
      </StampIn>,
    );
    expect(landing.scheduled).toHaveLength(1);
    expect(landing.cleared).toEqual([]);
  });
});

describe('StampIn - when it must not move', () => {
  test('under reduced motion it simply appears: no animation, no timer, no haptic', async () => {
    setMotion(true);
    await render(
      <StampIn tiltDeg={3}>
        <Text>stamp</Text>
      </StampIn>,
    );
    expect(entering()).toBeUndefined();
    expect(landing.scheduled).toHaveLength(0);
    expect(stamp).not.toHaveBeenCalled();
    expect(screen.getByText('stamp')).toBeOnTheScreen();
  });

  test('a stamp that has landed before (play is false) simply appears too', async () => {
    await render(
      <StampIn tiltDeg={3} play={false}>
        <Text>stamp</Text>
      </StampIn>,
    );
    expect(entering()).toBeUndefined();
    expect(landing.scheduled).toHaveLength(0);
    expect(stamp).not.toHaveBeenCalled();
  });

  test('plays by default', async () => {
    await render(
      <StampIn tiltDeg={0}>
        <Text>stamp</Text>
      </StampIn>,
    );
    expect(entering()).toBeDefined();
    expect(landing.scheduled).toHaveLength(1);
  });

  test('follows reduced motion live: switched on mid-flight, the thud is withdrawn', async () => {
    const view = await render(
      <StampIn tiltDeg={0}>
        <Text>stamp</Text>
      </StampIn>,
    );
    const [{ id }] = landing.scheduled;
    setMotion(true);
    await view.rerender(
      <StampIn tiltDeg={0}>
        <Text>stamp</Text>
      </StampIn>,
    );
    expect(landing.cleared).toContain(id);
    expect(stamp).not.toHaveBeenCalled();
  });
});
