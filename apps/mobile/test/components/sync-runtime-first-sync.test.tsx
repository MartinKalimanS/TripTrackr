/**
 * T136 — the explicit first-sync state (FR-042; sync-protocol.md §6 scenario 7).
 *
 * A brand-new device must say "syncing your trips", never show an empty
 * screen, and say "you're offline" — with a way to try again — rather than a
 * list that looks empty because nothing has arrived. The engine is a double
 * whose status the test steers; pinned are the states, their words, the
 * retry, the instant the real tabs appear, and the accessibility contract
 * (scroll container and touch targets at fontScale 1.8, live region,
 * reduced motion).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, Text } from 'react-native';

import {
  FIRST_SYNC_GRACE_MS,
  FirstSyncGate,
  firstSyncView,
} from '@/components/sync/first-sync-gate';
import { Colors, MinTouchTarget } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { Sentry } from '@/lib/sentry';
import { syncNow } from '@/sync/engine';
import type { SyncStatus } from '@/sync/types';

jest.mock('@/hooks/use-appearance');
jest.mock('@/lib/sentry', () => ({ Sentry: { captureException: jest.fn() } }));
jest.mock('@/sync/engine', () => {
  const { create } = require('zustand') as typeof import('zustand');
  const store = create(() => ({
    phase: 'idle',
    firstSyncComplete: false,
    lastSyncedAt: null,
    failure: null,
  }));
  return { useSyncStatus: () => store(), syncNow: jest.fn(), __store: store };
});

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const { __store: statusStore } = jest.requireMock('@/sync/engine') as {
  __store: { setState: (state: Partial<SyncStatus>) => void };
};

const IDLE: SyncStatus = {
  phase: 'idle',
  firstSyncComplete: false,
  lastSyncedAt: null,
  failure: null,
};

async function setStatus(next: Partial<SyncStatus>) {
  await act(async () => statusStore.setState(next));
}

function appearance(overrides: Partial<AppearanceContext> = {}) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    elevationProfile: 'full',
    tokens: Colors.light,
    ...overrides,
  } as AppearanceContext);
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

function hostTypes(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((child) => hostTypes(child, found));
  else if (node && typeof node === 'object') {
    const { type, children } = node as { type?: string; children?: unknown };
    if (type) found.add(type);
    hostTypes(children, found);
  }
  return found;
}

function renderGate() {
  return render(
    <FirstSyncGate>
      <Text testID="real-tabs">the real tabs</Text>
    </FirstSyncGate>,
  );
}

beforeEach(async () => {
  jest.useFakeTimers();
  appearance();
  (syncNow as jest.Mock).mockReset().mockResolvedValue({ ok: false });
  await setStatus(IDLE);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('firstSyncView — which state the traveller is in', () => {
  const base = IDLE;

  test('no failure: opening until the engine has had its moment, then syncing', () => {
    expect(firstSyncView(base, false)).toBe('opening');
    expect(firstSyncView(base, true)).toBe('syncing');
  });

  test('a known failure needs no waiting: it is shown at once', () => {
    expect(firstSyncView({ ...base, failure: 'offline' }, false)).toBe('offline');
    expect(firstSyncView({ ...base, failure: 'server' }, false)).toBe('failed');
    expect(firstSyncView({ ...base, failure: 'invalid_response' }, true)).toBe('failed');
    expect(firstSyncView({ ...base, failure: 'unauthorized' }, false)).toBe(
      'session-ended',
    );
  });
});

describe('the gate — a device that already has its data (no flash)', () => {
  test('renders the real tabs at once when the first sync is already complete', async () => {
    await setStatus({ firstSyncComplete: true });

    await renderGate();

    expect(screen.getByTestId('real-tabs')).toBeTruthy();
    expect(screen.queryByTestId('first-sync-screen')).toBeNull();
  });

  test('the engine confirming within the grace period never shows the syncing state', async () => {
    await renderGate();
    expect(screen.queryByText('Syncing your trips')).toBeNull();

    await advance(FIRST_SYNC_GRACE_MS - 1);
    await setStatus({ firstSyncComplete: true });

    expect(screen.getByTestId('real-tabs')).toBeTruthy();
    expect(screen.queryByText('Syncing your trips')).toBeNull();
  });

  test('once the tabs are up they stay up: the engine clearing its status on sign-out does not flash "syncing"', async () => {
    await setStatus({ firstSyncComplete: true });
    await renderGate();
    expect(screen.getByTestId('real-tabs')).toBeTruthy();

    // What the engine does when it unbinds, a moment before the layout leaves.
    await setStatus({ firstSyncComplete: false, phase: 'idle', failure: null });
    await advance(FIRST_SYNC_GRACE_MS * 2);

    expect(screen.getByTestId('real-tabs')).toBeTruthy();
    expect(screen.queryByTestId('first-sync-screen')).toBeNull();
  });

  test('does not announce a "ready" that nobody waited for', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    try {
      await renderGate();
      await setStatus({ firstSyncComplete: true });

      expect(screen.getByTestId('real-tabs')).toBeTruthy();
      expect(announce).not.toHaveBeenCalled();
    } finally {
      announce.mockRestore();
      os.restore();
    }
  });
});

describe('the gate — a brand-new device (FR-042, scenario 7)', () => {
  test('is never an empty screen: there is always a designed state with words', async () => {
    await renderGate();

    // Frame one, before the engine has said anything.
    expect(screen.getByTestId('first-sync-screen')).toBeTruthy();
    expect(screen.getByText('Opening your trips')).toBeTruthy();
    expect(screen.queryByTestId('real-tabs')).toBeNull();

    await advance(FIRST_SYNC_GRACE_MS);

    expect(screen.getByTestId('first-sync-screen')).toBeTruthy();
    expect(screen.getByText('Syncing your trips')).toBeTruthy();
    expect(screen.queryByTestId('real-tabs')).toBeNull();
  });

  test('says what is happening without claiming progress it cannot measure', async () => {
    await renderGate();
    await advance(FIRST_SYNC_GRACE_MS);

    expect(
      screen.getByText(/Bringing your trips from your account onto this device/),
    ).toBeTruthy();
    expect(screen.getByText(/clears by itself/)).toBeTruthy();
    // No percentages, counts or ETAs: the engine reports none.
    expect(screen.queryByText(/\d+\s?%|\d+ of \d+|seconds|minutes/)).toBeNull();
  });

  test('shows the real tabs the instant the first sync completes', async () => {
    await renderGate();
    await advance(FIRST_SYNC_GRACE_MS);
    expect(screen.queryByTestId('real-tabs')).toBeNull();

    await setStatus({
      firstSyncComplete: true,
      phase: 'idle',
      lastSyncedAt: '2026-09-30T10:00:00.000Z',
    });

    expect(screen.getByTestId('real-tabs')).toBeTruthy();
    expect(screen.queryByTestId('first-sync-screen')).toBeNull();
    expect(screen.queryByText('Syncing your trips')).toBeNull();
  });

  test('on iOS, announces that the trips are ready once they are — because the traveller waited for it', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    try {
      await renderGate();
      await advance(FIRST_SYNC_GRACE_MS);
      announce.mockClear();

      await setStatus({ firstSyncComplete: true });

      expect(announce).toHaveBeenCalledWith('Your trips are ready.');
    } finally {
      announce.mockRestore();
      os.restore();
    }
  });

  test('keeps syncing while a pull is in flight, and still shows no list', async () => {
    await setStatus({ phase: 'pulling' });
    await renderGate();
    await advance(FIRST_SYNC_GRACE_MS);

    expect(screen.getByText('Syncing your trips')).toBeTruthy();
    expect(screen.queryByTestId('real-tabs')).toBeNull();
  });
});

describe('the gate — offline on a brand-new device', () => {
  test('says so plainly, as an ordinary state, at once', async () => {
    await setStatus({ failure: 'offline' });
    await renderGate();

    expect(screen.getByTestId('first-sync-screen')).toBeTruthy();
    expect(screen.getByText('You’re offline')).toBeTruthy();
    expect(screen.getByText(/Connect to the internet to load your trips/)).toBeTruthy();
    expect(screen.getByText(/safe in your account/)).toBeTruthy();
    expect(screen.queryByText('Syncing your trips')).toBeNull();
    expect(screen.queryByTestId('real-tabs')).toBeNull();
  });

  test('is not dressed as an error: no danger wording, no fault', async () => {
    await setStatus({ failure: 'offline' });
    await renderGate();

    expect(screen.queryByText(/error|failed|went wrong|problem/i)).toBeNull();
  });

  test('retry runs a manual cycle', async () => {
    await setStatus({ failure: 'offline' });
    await renderGate();

    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(syncNow).toHaveBeenCalledWith('manual');
  });

  test('the retry is busy while its cycle runs, and usable again after', async () => {
    let finish: (result: { ok: boolean }) => void = () => undefined;
    (syncNow as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await setStatus({ failure: 'offline' });
    await renderGate();

    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(screen.getByLabelText('Try again').props.accessibilityState).toMatchObject({
      busy: true,
    });

    await act(async () => finish({ ok: false }));

    expect(screen.getByLabelText('Try again').props.accessibilityState).toMatchObject({
      busy: false,
    });
  });

  test('a cycle already under way keeps the retry busy, whoever started it', async () => {
    await setStatus({ failure: 'offline', phase: 'pulling' });
    await renderGate();

    expect(screen.getByLabelText('Try again').props.accessibilityState).toMatchObject({
      busy: true,
    });
  });

  test('moves on by itself when connectivity returns and a cycle starts', async () => {
    await setStatus({ failure: 'offline' });
    await renderGate();
    expect(screen.getByText('You’re offline')).toBeTruthy();

    await setStatus({ failure: null, phase: 'pulling' });

    expect(screen.queryByText('You’re offline')).toBeNull();
    expect(screen.getByTestId('first-sync-screen')).toBeTruthy();

    await setStatus({ firstSyncComplete: true, phase: 'idle' });
    expect(screen.getByTestId('real-tabs')).toBeTruthy();
  });

  test('a retry that throws is reported and does not leave the button stuck', async () => {
    const failure = new Error('engine exploded');
    (syncNow as jest.Mock).mockRejectedValue(failure);
    await setStatus({ failure: 'offline' });
    await renderGate();

    await fireEvent.press(screen.getByLabelText('Try again'));
    await act(async () => undefined);

    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect(screen.getByLabelText('Try again').props.accessibilityState).toMatchObject({
      busy: false,
    });
  });
});

describe('the gate — other failures', () => {
  test.each(['server', 'invalid_response'] as const)(
    '%s: calm copy, no code or stack, and a retry',
    async (failure) => {
      await setStatus({ failure });
      await renderGate();

      expect(screen.getByText('Your trips haven’t loaded yet')).toBeTruthy();
      expect(screen.getByText(/not with your account/)).toBeTruthy();
      expect(screen.queryByText(failure)).toBeNull();

      await fireEvent.press(screen.getByLabelText('Try again'));
      expect(syncNow).toHaveBeenCalledWith('manual');
    },
  );

  test('unauthorized: says the session ended and offers no retry that could not work', async () => {
    await setStatus({ failure: 'unauthorized' });
    await renderGate();

    expect(screen.getByText('Please sign in again')).toBeTruthy();
    expect(screen.queryByLabelText('Try again')).toBeNull();
  });
});

describe('the gate — accessibility (feature 002 C13, FR-016, FR-017)', () => {
  test('announces itself: the state card is a polite live region', async () => {
    await renderGate();
    await advance(FIRST_SYNC_GRACE_MS);

    const card = screen.getByTestId('first-sync-state');
    expect(card.props.accessibilityLiveRegion).toBe('polite');
  });

  test('on iOS, each change of state is announced out loud, but the silent opening frame is not', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    try {
      await renderGate();
      expect(announce).not.toHaveBeenCalled();

      await advance(FIRST_SYNC_GRACE_MS);
      expect(announce).toHaveBeenLastCalledWith(
        expect.stringContaining('Syncing your trips'),
      );

      await setStatus({ failure: 'offline' });
      expect(announce).toHaveBeenLastCalledWith(
        expect.stringContaining('You’re offline'),
      );
    } finally {
      announce.mockRestore();
      os.restore();
    }
  });

  test('at fontScale 1.8 the content sits in a scroll container and the retry keeps a full touch target', async () => {
    appearance({ fontScale: 1.8 });
    await setStatus({ failure: 'offline' });
    await renderGate();

    expect(hostTypes(screen.toJSON())).toContain('RCTScrollView');

    const retry = screen.getByLabelText('Try again');
    const style = Object.assign(
      {},
      ...[retry.props.style].flat(Infinity).filter(Boolean),
    );
    expect(style.minHeight).toBeGreaterThanOrEqual(MinTouchTarget * 1.8);
  });

  test('no text is truncated, so every word survives the largest text size', async () => {
    appearance({ fontScale: 1.8 });
    await setStatus({ failure: 'offline' });
    await renderGate();

    for (const text of [
      screen.getByText('You’re offline'),
      screen.getByText(/Connect to the internet/),
    ]) {
      expect(text.props.numberOfLines).toBeUndefined();
    }
  });

  test('shows a spinner by default while it works', async () => {
    await renderGate();
    await advance(FIRST_SYNC_GRACE_MS);
    expect(hostTypes(screen.toJSON())).toContain('ActivityIndicator');
  });

  test('the spinner is a motion, so it is left out when the traveller asked for less', async () => {
    appearance({ prefersLessMotion: true });
    await renderGate();
    await advance(FIRST_SYNC_GRACE_MS);

    expect(screen.getByText('Syncing your trips')).toBeTruthy();
    expect(hostTypes(screen.toJSON())).not.toContain('ActivityIndicator');
  });
});
