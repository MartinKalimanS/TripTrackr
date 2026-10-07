/**
 * T133 (UI half) — the conflict notice (FR-040; sync-protocol.md §2).
 *
 * When a newer version replaces something the traveller wrote, they are TOLD:
 * the superseded device must never overwrite silently. The notices come from
 * `useConflictNotices()` (the engine raises them); pinned here is how they
 * are presented — plainly, dismissibly, announced, reachable at fontScale 1.8,
 * never drawn over media (FR-024) — and that "view trip" goes where it says.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { ConflictNoticeBanner, ConflictNotices } from '@/components/ui/conflict-notice';
import { Colors, MinTouchTarget } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { useConflictStore } from '@/sync/conflicts';
import type { ConflictNotice } from '@/sync/types';

jest.mock('@/hooks/use-appearance');

// `mock`-prefixed so Jest's hoisted factory may reference it.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), back: jest.fn() }),
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function appearance(overrides: Partial<AppearanceContext> = {}) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    elevationProfile: 'full',
    tokens: Colors.light,
    ...overrides,
  } as AppearanceContext);
}

function notice(id: string, overrides: Partial<ConflictNotice> = {}): ConflictNotice {
  return {
    id,
    table: 'notes',
    recordId: `record-${id}`,
    tripId: 'trip-1',
    summary: `Your edit to “Night train” (${id}) was replaced by a newer version from another device.`,
    detectedAt: '2026-09-30T10:00:00.000Z',
    ...overrides,
  };
}

async function raise(...notices: ConflictNotice[]) {
  await act(async () => {
    for (const next of notices) useConflictStore.getState().raise(next);
  });
}

function styleOf(node: { props: { style?: unknown } }) {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
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

beforeEach(() => {
  appearance();
  mockPush.mockReset();
  useConflictStore.getState().clear();
});

describe('<ConflictNotices> — told, not silently overwritten (FR-040)', () => {
  test('renders nothing at all while there is nothing to tell', async () => {
    await render(<ConflictNotices />);

    expect(screen.toJSON()).toBeNull();
  });

  test('tells the traveller, in the sentence the engine already wrote for them', async () => {
    await raise(notice('a'));
    await render(<ConflictNotices />);

    expect(screen.getByText('Updated from another device')).toBeTruthy();
    expect(screen.getByText(notice('a').summary)).toBeTruthy();
    expect(screen.getByTestId('conflict-notice-a')).toBeTruthy();
  });

  test('a notice raised while the app is open appears without a reload', async () => {
    await render(<ConflictNotices />);
    expect(screen.toJSON()).toBeNull();

    await raise(notice('late'));

    expect(screen.getByTestId('conflict-notice-late')).toBeTruthy();
  });

  test('shows each notice, oldest first', async () => {
    await raise(notice('one'), notice('two'));
    await render(<ConflictNotices />);

    const ids = screen
      .getAllByTestId(/^conflict-notice-(one|two)$/)
      .map((node) => node.props.testID);
    expect(ids).toEqual(['conflict-notice-one', 'conflict-notice-two']);
  });
});

describe('<ConflictNotices> — dismissing', () => {
  test('a notice is dismissed with its own control, and the others stay', async () => {
    await raise(notice('one'), notice('two'));
    await render(<ConflictNotices />);

    await fireEvent.press(screen.getByTestId('conflict-notice-one-dismiss'));

    expect(screen.queryByTestId('conflict-notice-one')).toBeNull();
    expect(screen.getByTestId('conflict-notice-two')).toBeTruthy();
    expect(useConflictStore.getState().notices.map((n) => n.id)).toEqual(['two']);
  });

  test('the last dismissal leaves nothing on screen', async () => {
    await raise(notice('only'));
    await render(<ConflictNotices />);

    await fireEvent.press(screen.getByTestId('conflict-notice-only-dismiss'));

    expect(screen.toJSON()).toBeNull();
  });

  test('the control is labelled for what it does', async () => {
    await raise(notice('a'));
    await render(<ConflictNotices />);

    expect(screen.getByLabelText('Dismiss this notice')).toBeTruthy();
  });

  test('the dismiss target is at least the platform minimum, and grows with the text', async () => {
    await raise(notice('a'));
    await render(<ConflictNotices />);
    expect(
      styleOf(screen.getByTestId('conflict-notice-a-dismiss')).minHeight,
    ).toBeGreaterThanOrEqual(MinTouchTarget);

    appearance({ fontScale: 1.8 });
    await render(<ConflictNotices />);
    const targets = screen.getAllByTestId('conflict-notice-a-dismiss');
    expect(styleOf(targets.at(-1)!).minHeight).toBeGreaterThanOrEqual(
      MinTouchTarget * 1.8,
    );
  });
});

describe('<ConflictNotices> — going to the trip', () => {
  test('offers the trip when the notice belongs to one, and goes there', async () => {
    await raise(notice('a', { tripId: 'trip-42' }));
    await render(<ConflictNotices />);

    await fireEvent.press(screen.getByLabelText('View the trip this change was made in'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/trip/trip-42');
  });

  test('having gone to look, the notice has done its job and is cleared', async () => {
    await raise(notice('a', { tripId: 'trip-42' }));
    await render(<ConflictNotices />);

    await fireEvent.press(screen.getByTestId('conflict-notice-a-open'));

    expect(screen.queryByTestId('conflict-notice-a')).toBeNull();
  });

  test('offers nothing to open when the record belongs to no trip', async () => {
    await raise(notice('a', { tripId: null, table: 'expense_categories' }));
    await render(<ConflictNotices />);

    expect(screen.queryByTestId('conflict-notice-a-open')).toBeNull();
    expect(screen.getByTestId('conflict-notice-a-dismiss')).toBeTruthy();
  });
});

describe('<ConflictNotices> — a long queue stays manageable', () => {
  const five = ['a', 'b', 'c', 'd', 'e'].map((id) => notice(id));

  test('shows the first three in full and says how many more there are', async () => {
    await raise(...five);
    await render(<ConflictNotices />);

    expect(screen.getByTestId('conflict-notice-a')).toBeTruthy();
    expect(screen.getByTestId('conflict-notice-c')).toBeTruthy();
    expect(screen.queryByTestId('conflict-notice-d')).toBeNull();
    expect(screen.getByText('and 2 more')).toBeTruthy();
  });

  test('“Dismiss all” clears the lot', async () => {
    await raise(...five);
    await render(<ConflictNotices />);

    await fireEvent.press(screen.getByLabelText('Dismiss all notices'));

    expect(useConflictStore.getState().notices).toHaveLength(0);
    expect(screen.toJSON()).toBeNull();
  });

  test('dismissing one lets the next queued notice in', async () => {
    await raise(...five);
    await render(<ConflictNotices />);

    await fireEvent.press(screen.getByTestId('conflict-notice-a-dismiss'));

    expect(screen.getByTestId('conflict-notice-d')).toBeTruthy();
    expect(screen.getByText('and 1 more')).toBeTruthy();
  });

  test('with three or fewer there is no overflow row', async () => {
    await raise(notice('a'), notice('b'), notice('c'));
    await render(<ConflictNotices />);

    expect(screen.queryByText(/^and \d+ more$/)).toBeNull();
    expect(screen.queryByLabelText('Dismiss all notices')).toBeNull();
  });
});

describe('<ConflictNotices> — accessibility (feature 002 C13, FR-016, FR-017, FR-024)', () => {
  test('announces itself: the region is a polite live region', async () => {
    await raise(notice('a'));
    await render(<ConflictNotices />);

    expect(screen.getByTestId('conflict-notices').props.accessibilityLiveRegion).toBe(
      'polite',
    );
  });

  test('on iOS a new notice is announced out loud, once, and never again for a dismissal', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    try {
      await render(<ConflictNotices />);
      expect(announce).not.toHaveBeenCalled();

      await raise(notice('a'));
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenLastCalledWith(
        expect.stringContaining(notice('a').summary),
      );

      await raise(notice('b'));
      expect(announce).toHaveBeenCalledTimes(2);
      expect(announce).toHaveBeenLastCalledWith(
        expect.stringContaining(notice('b').summary),
      );
      expect(announce).toHaveBeenLastCalledWith(
        expect.not.stringContaining(notice('a').summary),
      );

      await fireEvent.press(screen.getByTestId('conflict-notice-b-dismiss'));
      expect(announce).toHaveBeenCalledTimes(2);
    } finally {
      announce.mockRestore();
      os.restore();
    }
  });

  test('at fontScale 1.8 the notices sit in a scroll container, so nothing is cut off or unreachable', async () => {
    appearance({ fontScale: 1.8 });
    await raise(notice('a'), notice('b'));
    await render(<ConflictNotices />);

    expect(hostTypes(screen.toJSON())).toContain('RCTScrollView');
  });

  test('no text is truncated, so the whole sentence survives the largest text size', async () => {
    appearance({ fontScale: 1.8 });
    await raise(notice('a'));
    await render(<ConflictNotices />);

    expect(screen.getByText(notice('a').summary).props.numberOfLines).toBeUndefined();
    expect(
      screen.getByText('Updated from another device').props.numberOfLines,
    ).toBeUndefined();
  });

  test('sits in the flow above the app and is never laid over its content (FR-024: no tint or shadow across a photo or map)', async () => {
    await raise(notice('a'));
    await render(<ConflictNotices />);

    for (const id of ['conflict-notices', 'conflict-notice-a']) {
      expect(styleOf(screen.getByTestId(id)).position).not.toBe('absolute');
    }
  });

  test('is told apart by words, not by colour alone (FR-010)', async () => {
    await raise(notice('a'));
    await render(<ConflictNotices />);

    expect(screen.getByText('Updated from another device')).toBeTruthy();
  });
});

describe('<ConflictNoticeBanner> — one notice on its own', () => {
  test('dismisses through the callback it is given, and only offers a trip when given one', async () => {
    const onDismiss = jest.fn();
    await render(<ConflictNoticeBanner notice={notice('solo')} onDismiss={onDismiss} />);

    expect(screen.queryByTestId('conflict-notice-solo-open')).toBeNull();

    await fireEvent.press(screen.getByTestId('conflict-notice-solo-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('opens through the callback it is given', async () => {
    const onOpenTrip = jest.fn();
    await render(
      <ConflictNoticeBanner
        notice={notice('solo')}
        onDismiss={jest.fn()}
        onOpenTrip={onOpenTrip}
      />,
    );

    await fireEvent.press(screen.getByTestId('conflict-notice-solo-open'));
    expect(onOpenTrip).toHaveBeenCalledTimes(1);
  });
});
