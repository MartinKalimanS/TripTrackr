/**
 * T558 - the count-up TRIGGER POLICY (feature 005; FR-060, FR-073, FR-076; research D5-11,
 * D5-14): a figure counts up ONCE per appearance, not on every render or every refresh of its
 * data; a screen reader is given the FINAL value from the first render and never a frame; and
 * nothing counts under reduced motion.
 *
 *   appearance   the figure mounts (the Home sheet reaching half, the passport after its
 *                skeleton): 0 to the value in `Motion.countUpMs`, once.
 *   refresh      a new value after that count is drawn at once, no timer, no replay.
 *   in flight    a new value while it is still counting is taken on from the figure drawn,
 *                never restarted from nothing and never stacked.
 *   late data    a figure that first appeared as nothing (the store has not answered) counts
 *                when its first real value arrives, once.
 *
 * Time is Jest's fake clock: the engine's interval and `Date.now()` move together.
 */
import { act, render, screen } from '@testing-library/react-native';

import { Motion } from '@/theme';

import { appearance } from '../../../test/helpers/appearance';

import { AnimatedNumber } from './animated-number';
import { FRAME_MS } from './count-up';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

let started: jest.SpyInstance;
let stopped: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  started = jest.spyOn(globalThis, 'setInterval');
  stopped = jest.spyOn(globalThis, 'clearInterval');
  useAppearance.mockReturnValue(appearance());
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** A count ends on the first frame at or after its duration. */
const COUNT_DONE = Motion.countUpMs + FRAME_MS;
/** How many counts have been started: one interval of `FRAME_MS` each. */
const counts = () =>
  started.mock.calls.filter(([, ms]: [unknown, number]) => ms === FRAME_MS).length;
const run = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });
const drawn = (id = 'n') => String(screen.getByTestId(id).props.children);
const label = (id = 'n') => screen.getByTestId(id).props.accessibilityLabel as string;
const figure = (value: number) => <AnimatedNumber value={value} testID="n" />;

describe('the figure counts once per appearance', () => {
  test('from nothing to the value in the count-up budget, with one count', async () => {
    await render(figure(1200));
    expect(drawn()).toBe('0');
    expect(counts()).toBe(1);
    await run(Motion.countUpMs / 2);
    expect(Number(drawn().replace(',', ''))).toBeGreaterThan(0);
    expect(drawn()).not.toBe('1,200');
    await run(COUNT_DONE);
    expect(drawn()).toBe('1,200');
    expect(counts()).toBe(1);
    expect(Motion.countUpMs).toBeLessThan(1000);
  });

  test('drawn again with the same value it does not count again', async () => {
    const view = await render(figure(14));
    await run(COUNT_DONE);
    await view.rerender(figure(14));
    await view.rerender(figure(14));
    await run(2000);
    expect(drawn()).toBe('14');
    expect(counts()).toBe(1);
  });

  test('a figure that appears again (a new mount) counts again: that is a new appearance', async () => {
    const first = await render(figure(14));
    await run(COUNT_DONE);
    await first.unmount();
    await render(figure(14));
    expect(drawn()).toBe('0');
    expect(counts()).toBe(2);
    await run(COUNT_DONE);
    expect(drawn()).toBe('14');
  });
});

describe('a refresh of the data does not replay it', () => {
  test('a new value after the count is on the screen at once, with no count', async () => {
    const view = await render(figure(14));
    await run(COUNT_DONE);
    await view.rerender(figure(20));
    expect(drawn()).toBe('20');
    expect(label()).toBe('20');
    await view.rerender(figure(3));
    expect(drawn()).toBe('3');
    expect(counts()).toBe(1);
  });

  test('a refresh at once leaves no timer running for it to finish', async () => {
    const view = await render(figure(14));
    await run(COUNT_DONE);
    await view.rerender(figure(20));
    await run(5000);
    expect(drawn()).toBe('20');
    expect(counts()).toBe(1);
  });
});

describe('a value that arrives while it counts is taken on, not restarted', () => {
  test('continues from the figure drawn and ends on the new value, with one count alive', async () => {
    const view = await render(figure(100));
    await run(Motion.countUpMs / 2);
    const reached = Number(drawn());
    expect(reached).toBeGreaterThan(50);
    await view.rerender(figure(200));
    // The same instant: not back to nothing, and not jumped to the end.
    expect(Number(drawn())).toBeGreaterThanOrEqual(reached);
    expect(Number(drawn())).toBeLessThan(200);
    expect(counts()).toBe(2);
    expect(stopped).toHaveBeenCalledTimes(1);
    await run(COUNT_DONE);
    expect(drawn()).toBe('200');
    await run(2000);
    expect(drawn()).toBe('200');
  });
});

describe('late data: a figure that first appeared as nothing counts when its value arrives', () => {
  test('0 has nothing to count; the first real value counts, once', async () => {
    const view = await render(figure(0));
    expect(drawn()).toBe('0');
    expect(counts()).toBe(0);
    await run(2000);
    expect(counts()).toBe(0);
    await view.rerender(figure(14));
    expect(drawn()).toBe('0');
    expect(counts()).toBe(1);
    await run(COUNT_DONE);
    expect(drawn()).toBe('14');
  });

  test('and only that value: the next refresh is at once', async () => {
    const view = await render(figure(0));
    await view.rerender(figure(14));
    await run(COUNT_DONE);
    await view.rerender(figure(15));
    expect(drawn()).toBe('15');
    expect(counts()).toBe(1);
  });

  test('is silent from the first render: the name is already the final value', async () => {
    const view = await render(figure(0));
    expect(label()).toBe('0');
    await view.rerender(figure(14));
    expect(drawn()).toBe('0');
    expect(label()).toBe('14');
  });
});

describe('assistive technology hears the final value, from the first render, whatever is drawn', () => {
  test('no frame of a count, a refresh or late data ever names an intermediate figure', async () => {
    const view = await render(figure(1200));
    const seen = new Set<string>([label()]);
    for (let step = 0; step < 24; step += 1) {
      await run(FRAME_MS * 2);
      seen.add(label());
    }
    expect([...seen]).toEqual(['1,200']);
    await view.rerender(figure(1300));
    expect(label()).toBe('1,300');
    expect(screen.getByTestId('n').props.accessibilityLiveRegion).toBeUndefined();
  });

  test('a caller name stays the caller name through every frame', async () => {
    await render(
      <AnimatedNumber value={14} accessibilityLabel="14 of 195 countries" testID="n" />,
    );
    const seen = new Set<string>();
    for (let step = 0; step < 12; step += 1) {
      seen.add(label());
      await run(FRAME_MS * 2);
    }
    expect([...seen]).toEqual(['14 of 195 countries']);
  });
});

describe('nothing counts under reduced motion (FR-073)', () => {
  beforeEach(() =>
    useAppearance.mockReturnValue(appearance({ prefersLessMotion: true })),
  );

  test('the appearance, a refresh and late data are all the final text, with no timer', async () => {
    const view = await render(figure(0));
    expect(drawn()).toBe('0');
    await view.rerender(figure(14));
    expect(drawn()).toBe('14');
    expect(label()).toBe('14');
    await view.rerender(figure(20));
    expect(drawn()).toBe('20');
    expect(counts()).toBe(0);
  });

  test('a figure that appeared without motion does not count when motion comes back', async () => {
    const view = await render(figure(14));
    expect(drawn()).toBe('14');
    useAppearance.mockReturnValue(appearance({ prefersLessMotion: false }));
    await view.rerender(figure(14));
    expect(drawn()).toBe('14');
    await view.rerender(figure(20));
    expect(drawn()).toBe('20');
    expect(counts()).toBe(0);
  });

  test('asking for reduced motion mid-count stops it on the final figure', async () => {
    useAppearance.mockReturnValue(appearance());
    const view = await render(figure(500));
    await run(100);
    useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
    await view.rerender(figure(500));
    expect(drawn()).toBe('500');
    expect(stopped).toHaveBeenCalledTimes(1);
    await run(1000);
    expect(drawn()).toBe('500');
  });
});
