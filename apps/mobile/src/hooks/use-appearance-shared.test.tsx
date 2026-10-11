/**
 * Feature 004, T461 follow-up: every consumer of `useAppearance` shares ONE set of
 * `AccessibilityInfo` listeners and ONE set of native reads (contract C4-4).
 *
 * A list of 200 trip cards or 1,000 expense rows mounts a `Button` (so `useHaptics`, so
 * `useAppearance`) per row. If each registered its own listeners and read the three signals
 * itself, the list would pay for thousands of subscriptions and async reads. The suites in
 * `use-appearance.test.ts` pin what one consumer sees; this one pins what many cost.
 */
import { act, render, renderHook } from '@testing-library/react-native';
import { Profiler, StrictMode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { Colors } from '@/constants/theme';

import { __resetAppearanceStoreForTests } from './appearance-store';
import { useAppearance, type AppearanceContext } from './use-appearance';

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

const IOS_EVENTS = [
  'darkerSystemColorsChanged',
  'reduceMotionChanged',
  'reduceTransparencyChanged',
];
const ANDROID_EVENTS = ['highTextContrastChanged', 'reduceMotionChanged'];

interface Registration {
  event: string;
  handler: () => void;
  remove: jest.Mock;
}

/** Every `addEventListener` call of the test, with the `remove` it handed back. */
let registrations: Registration[];
/** What the OS reports for iOS "Increase Contrast"; a test changes it, then fires an event. */
let darker: boolean;
let darkerQuery: jest.Mock;
let os: ReturnType<typeof jest.replaceProperty>;

beforeEach(() => {
  registrations = [];
  darker = false;
  darkerQuery = jest.fn(async () => darker);
  os = jest.replaceProperty(Platform, 'OS', 'ios');
  Object.assign(AccessibilityInfo, { isDarkerSystemColorsEnabled: darkerQuery });
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    event: string,
    handler: () => void,
  ) => {
    const remove = jest.fn();
    registrations.push({ event, handler, remove });
    return { remove };
  }) as never);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
});

afterEach(() => {
  // The store is shared by the whole module registry: a test must not inherit the last one's.
  __resetAppearanceStoreForTests();
  jest.restoreAllMocks();
  os.restore();
  delete (AccessibilityInfo as { isDarkerSystemColorsEnabled?: unknown })
    .isDarkerSystemColorsEnabled;
  delete (AccessibilityInfo as { isHighTextContrastEnabled?: unknown })
    .isHighTextContrastEnabled;
});

/** Lets every pending native read (and the renders it causes) settle. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The OS fires its change events: every registered handler runs. */
async function fireEvents() {
  await act(async () => {
    registrations.forEach(({ handler }) => handler());
  });
  await settle();
}

/** One consumer; every render it makes is handed to `onRender`. */
function Probe({ onRender }: { onRender: (appearance: AppearanceContext) => void }) {
  onRender(useAppearance());
  return null;
}

/** A list of consumers, as a screen of buttons mounts them. */
function Probes({
  count,
  onRender,
}: {
  count: number;
  onRender: (appearance: AppearanceContext) => void;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <Probe key={index} onRender={onRender} />
      ))}
    </>
  );
}

const ignore = () => undefined;
const eventNames = () => registrations.map(({ event }) => event).sort();

describe('N consumers cost one subscription and one set of reads (T461)', () => {
  test('50 mounted consumers register ONE listener per iOS event and read each signal once', async () => {
    await render(<Probes count={50} onRender={ignore} />);
    await settle();

    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledTimes(3);
    expect(eventNames()).toEqual(IOS_EVENTS);
    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.isReduceTransparencyEnabled).toHaveBeenCalledTimes(1);
    expect(darkerQuery).toHaveBeenCalledTimes(1);
  });

  test('on Android: two events, no transparency query (the platform has no such setting)', async () => {
    os.restore();
    os = jest.replaceProperty(Platform, 'OS', 'android');
    const highContrast = jest.fn(async () => false);
    Object.assign(AccessibilityInfo, { isHighTextContrastEnabled: highContrast });

    await render(<Probes count={50} onRender={ignore} />);
    await settle();

    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledTimes(2);
    expect(eventNames()).toEqual(ANDROID_EVENTS);
    expect(highContrast).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.isReduceTransparencyEnabled).not.toHaveBeenCalled();
  });

  test('consumers mounted later, in other trees, join the subscription instead of adding one', async () => {
    await render(<Probe onRender={ignore} />);
    await settle();
    await render(<Probes count={10} onRender={ignore} />);
    await render(<Probes count={10} onRender={ignore} />);
    await settle();

    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledTimes(3);
    expect(darkerQuery).toHaveBeenCalledTimes(1);
  });

  test('one change event costs one more read of each signal, however many consumers listen', async () => {
    await render(<Probes count={50} onRender={ignore} />);
    await settle();

    await act(async () => {
      registrations[0].handler();
    });
    await settle();

    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(2);
    expect(AccessibilityInfo.isReduceTransparencyEnabled).toHaveBeenCalledTimes(2);
    expect(darkerQuery).toHaveBeenCalledTimes(2);
  });

  test('a consumer mounted late sees the CURRENT value in its very first render', async () => {
    darker = true;
    await render(<Probe onRender={ignore} />);
    await settle();

    const lateRenders: AppearanceContext[] = [];
    await render(<Probe onRender={(appearance) => lateRenders.push(appearance)} />);

    expect(lateRenders[0]).toEqual(
      expect.objectContaining({
        ready: true,
        prefersMoreContrast: true,
        themeName: 'light-contrast',
      }),
    );
    // And it did not start a second read of its own to learn that.
    expect(darkerQuery).toHaveBeenCalledTimes(1);
  });
});

describe('the subscription lives exactly as long as there are consumers (T461)', () => {
  test('nothing is removed while one consumer remains; everything is once the last unmounts', async () => {
    const first = await render(<Probe onRender={ignore} />);
    const second = await render(<Probe onRender={ignore} />);
    await settle();

    await first.unmount();
    expect(registrations.every(({ remove }) => remove.mock.calls.length === 0)).toBe(
      true,
    );

    await second.unmount();
    expect(registrations).toHaveLength(3);
    expect(registrations.map(({ remove }) => remove.mock.calls.length)).toEqual([
      1, 1, 1,
    ]);
  });

  test('mounting again restarts the native side: fresh listeners, fresh reads', async () => {
    const first = await render(<Probes count={5} onRender={ignore} />);
    await settle();
    await first.unmount();

    await render(<Probes count={5} onRender={ignore} />);
    await settle();

    expect(AccessibilityInfo.addEventListener).toHaveBeenCalledTimes(6);
    expect(darkerQuery).toHaveBeenCalledTimes(2);
    expect(registrations.map(({ remove }) => remove.mock.calls.length)).toEqual([
      1, 1, 1, 0, 0, 0,
    ]);
  });

  test('a handler of a torn-down subscription is inert: no read, no render, no warning', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const mounted = await render(<Probe onRender={ignore} />);
    await settle();
    await mounted.unmount();
    const reads = darkerQuery.mock.calls.length;

    await fireEvents();

    expect(darkerQuery).toHaveBeenCalledTimes(reads);
    expect(errors).not.toHaveBeenCalled();
  });

  test('a read still in flight when the last consumer leaves does not leak into the next session', async () => {
    let answer: (value: boolean) => void = ignore;
    darkerQuery.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (answer = resolve)),
    );
    const first = await render(<Probe onRender={ignore} />);
    await first.unmount();

    const renders: AppearanceContext[] = [];
    await render(<Probe onRender={(appearance) => renders.push(appearance)} />);
    await act(async () => answer(true));
    await settle();

    // The late answer belongs to the session that was torn down. The second session's own
    // read (darker = false) is the one that counts.
    expect(renders.at(-1)).toEqual(
      expect.objectContaining({ ready: true, prefersMoreContrast: false }),
    );
  });
});

describe('stale while revalidate: no default ever flashes back (T461)', () => {
  /** What the contrast flags and `ready` looked like in each render, in order. */
  const shape = (renders: AppearanceContext[]) =>
    renders.map(({ ready, prefersMoreContrast }) => ({ ready, prefersMoreContrast }));

  test('a same-commit handover (consumer A out, consumer B in) never shows B a default', async () => {
    darker = true;
    const firstRenders: AppearanceContext[] = [];
    const secondRenders: AppearanceContext[] = [];
    function Handover({ showFirst }: { showFirst: boolean }) {
      return showFirst ? (
        <Probe key="first" onRender={(appearance) => firstRenders.push(appearance)} />
      ) : (
        <Probe key="second" onRender={(appearance) => secondRenders.push(appearance)} />
      );
    }
    const { rerender } = await render(<Handover showFirst />);
    await settle();
    expect(firstRenders.at(-1)).toEqual(
      expect.objectContaining({ ready: true, prefersMoreContrast: true }),
    );

    await rerender(<Handover showFirst={false} />);
    await settle();

    expect(secondRenders.length).toBeGreaterThan(0);
    expect(shape(secondRenders)).toEqual(
      Array(secondRenders.length).fill({ ready: true, prefersMoreContrast: true }),
    );
    expect(secondRenders.at(-1)?.themeName).toBe('light-contrast');
  });

  test('a handover leaves exactly one live native subscription behind', async () => {
    function Handover({ showFirst }: { showFirst: boolean }) {
      return <Probe key={showFirst ? 'first' : 'second'} onRender={ignore} />;
    }
    const { rerender } = await render(<Handover showFirst />);
    await settle();

    await rerender(<Handover showFirst={false} />);
    await settle();

    const live = registrations.filter(({ remove }) => remove.mock.calls.length === 0);
    expect(live).toHaveLength(3);
    expect(registrations).toHaveLength(6);
  });

  test('a <StrictMode> mount (effects run, clean up and run again) never reverts `ready`', async () => {
    darker = true;
    const renders: AppearanceContext[] = [];
    await render(
      <StrictMode>
        <Probe onRender={(appearance) => renders.push(appearance)} />
      </StrictMode>,
    );
    await settle();

    const readiness = renders.map(({ ready }) => ready).join(',');
    // false... then true...: once `ready` is true it never goes back.
    expect(readiness).toMatch(/^(false,)*(true,)*true$/);
    expect(renders.at(-1)).toEqual(
      expect.objectContaining({ ready: true, prefersMoreContrast: true }),
    );
    // One session is live; the one the first effect pass started was stopped.
    const live = registrations.filter(({ remove }) => remove.mock.calls.length === 0);
    expect(live).toHaveLength(3);
  });

  test('a <StrictMode> mount on a settled store renders ready with the real flags every time', async () => {
    darker = true;
    const warm = await render(<Probe onRender={ignore} />);
    await settle();
    await warm.unmount();

    const renders: AppearanceContext[] = [];
    await render(
      <StrictMode>
        <Probe onRender={(appearance) => renders.push(appearance)} />
      </StrictMode>,
    );
    await settle();

    expect(renders.length).toBeGreaterThan(0);
    expect(shape(renders)).toEqual(
      Array(renders.length).fill({ ready: true, prefersMoreContrast: true }),
    );
  });

  test('a remount after a full unmount keeps the previous flags while it re-reads, then shows a changed answer', async () => {
    darker = true;
    const first = await render(<Probe onRender={ignore} />);
    await settle();
    await first.unmount();
    darker = false;

    const renders: AppearanceContext[] = [];
    await render(<Probe onRender={(appearance) => renders.push(appearance)} />);

    // Before the re-read answers: the last known flags, `ready` still true, no default.
    expect(renders[0]).toEqual(
      expect.objectContaining({
        ready: true,
        prefersMoreContrast: true,
        themeName: 'light-contrast',
      }),
    );

    await settle();

    expect(darkerQuery).toHaveBeenCalledTimes(2);
    expect(renders.every(({ ready }) => ready)).toBe(true);
    expect(renders.at(-1)).toEqual(
      expect.objectContaining({
        ready: true,
        prefersMoreContrast: false,
        themeName: 'light',
      }),
    );
  });

  test('a remount whose re-read agrees renders exactly once: nothing changed, nobody is woken', async () => {
    darker = true;
    const first = await render(<Probe onRender={ignore} />);
    await settle();
    await first.unmount();

    const renders: AppearanceContext[] = [];
    await render(<Probe onRender={(appearance) => renders.push(appearance)} />);
    await settle();

    expect(darkerQuery).toHaveBeenCalledTimes(2);
    expect(renders).toHaveLength(1);
  });
});

describe('an event updates every consumer in one commit (T461, FR-031)', () => {
  test('20 consumers re-render together, once, and all show the new value', async () => {
    const latest = new Map<number, AppearanceContext>();
    const commits = jest.fn();
    function Tracked({ index }: { index: number }) {
      latest.set(index, useAppearance());
      return null;
    }
    await render(
      <Profiler id="all-consumers" onRender={commits}>
        {Array.from({ length: 20 }, (_, index) => (
          <Tracked key={index} index={index} />
        ))}
      </Profiler>,
    );
    await settle();
    expect([...latest.values()].every((value) => value.themeName === 'light')).toBe(true);
    commits.mockClear();

    darker = true;
    await fireEvents();

    expect(commits).toHaveBeenCalledTimes(1);
    expect(latest.size).toBe(20);
    expect([...latest.values()].map((value) => value.themeName)).toEqual(
      Array(20).fill('light-contrast'),
    );
  });
});

describe('a failed read settles `ready` on the accessible fallback (C4, D4-05)', () => {
  test('a rejected platform query reads as more contrast, for every consumer, after ONE attempt', async () => {
    darkerQuery.mockRejectedValue(
      new Error('the accessibility service is not available'),
    );
    const renders: AppearanceContext[] = [];

    await render(
      <Probes count={5} onRender={(appearance) => renders.push(appearance)} />,
    );
    await settle();

    expect(renders.slice(0, 5).every((appearance) => !appearance.ready)).toBe(true);
    expect(renders.slice(-5)).toEqual(
      Array(5).fill(
        expect.objectContaining({
          ready: true,
          prefersMoreContrast: true,
          themeName: 'light-contrast',
        }),
      ),
    );
    expect(darkerQuery).toHaveBeenCalledTimes(1);
  });
});

describe('the snapshot is referentially stable (T461)', () => {
  test('the returned object is the same between renders while nothing changed', async () => {
    const { result, rerender } = await renderHook(() => useAppearance());
    await settle();
    const first = result.current;

    await rerender(undefined);

    expect(result.current).toBe(first);
  });

  test('a signal that re-reports the same value re-renders nobody and keeps the object', async () => {
    const renders = jest.fn();
    const { result } = await renderHook(() => {
      renders();
      return useAppearance();
    });
    await settle();
    const first = result.current;
    renders.mockClear();

    await fireEvents();
    await fireEvents();

    expect(renders).not.toHaveBeenCalled();
    expect(result.current).toBe(first);
  });

  test('a signal that changes produces a new object, with every other field carried over, and the tokens that follow the theme', async () => {
    const { result } = await renderHook(() => useAppearance());
    await settle();
    const first = result.current;

    darker = true;
    await fireEvents();

    expect(result.current).not.toBe(first);
    expect(result.current).toEqual({
      ...first,
      prefersMoreContrast: true,
      themeName: 'light-contrast',
      // The tokens are the palette of the NEW theme name (T453), not the base theme's.
      tokens: Colors['light-contrast'],
    });
  });
});
