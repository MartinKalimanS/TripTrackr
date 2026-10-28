/**
 * `HomeHeader` - the transparent zone over the globe (feature 005, T537; contract C5-32 "Home";
 * FR-014, FR-015, FR-021, FR-026): the greeting with the date, the ONE global sync chip, the ONE
 * banner when the phone is offline or a sync failed, and, only after the traveller has moved
 * the globe, the recentre control below it. It reports where it ends (`onMeasured`), which is
 * what the globe is fitted under (FR-013); the recentre control floats BELOW that edge and is
 * not part of the measure, so it appearing never moves the planet.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import type { SyncChipState } from '@/features/sync/use-sync-chip-state';

import { appearance } from '../../../../test/helpers/appearance';
import { HomeHeader } from '../home-header';

// `mock`-prefixed so Jest's hoisted factories may reference them.
const mockState: { current: SyncChipState } = { current: { kind: 'synced' } };

jest.mock('@/hooks/use-appearance');
jest.mock('@/features/sync/use-sync-chip-state', () => ({
  useSyncChipState: () => mockState.current,
}));
jest.mock('@/sync/engine', () => ({ syncNow: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock };
};
const { router } = jest.requireMock('expo-router') as {
  router: { push: jest.Mock; navigate: jest.Mock; replace: jest.Mock };
};

const INSETS = { top: 54, bottom: 34, left: 0, right: 0 };

beforeEach(() => {
  useAppearance.mockReturnValue(appearance());
  mockState.current = { kind: 'synced' };
  mockToast.show.mockClear();
});

async function renderHeader(
  props: Partial<React.ComponentProps<typeof HomeHeader>> = {},
) {
  return render(
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <HomeHeader
        name="Marta"
        today="2026-10-14"
        moved={false}
        onRecentre={jest.fn()}
        onMeasured={jest.fn()}
        {...props}
      />
    </SafeAreaInsetsContext.Provider>,
  );
}

describe('<HomeHeader> - the greeting zone', () => {
  test('says the date and "Hello, Marta", one heading', async () => {
    await renderHeader();
    expect(screen.getByTestId('home-greeting')).toHaveTextContent('Hello, Marta');
    expect(screen.getByTestId('home-greeting-date')).toBeTruthy();
    expect(screen.getAllByRole('header')).toHaveLength(1);
  });

  test('lets touches through to the globe, and clears the status bar', async () => {
    await renderHeader();
    const zone = screen.getByTestId('home-header');
    expect(zone.props.pointerEvents).toBe('box-none');
    const style = StyleSheet.flatten(zone.props.style);
    expect(style).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0 });
    expect(style.paddingTop).toBeGreaterThanOrEqual(INSETS.top);
  });

  test('reports its bottom edge in whole dp when it is laid out, and again when it changes', async () => {
    const onMeasured = jest.fn();
    await renderHeader({ onMeasured });
    const zone = screen.getByTestId('home-header');
    await fireEvent(zone, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 150.4 } },
    });
    expect(onMeasured).toHaveBeenLastCalledWith(150);
    await fireEvent(zone, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 198 } },
    });
    expect(onMeasured).toHaveBeenLastCalledWith(198);
  });
});

describe('<HomeHeader> - sync, once (FR-026, FR-021)', () => {
  test('shows nothing about sync when everything is synchronised', async () => {
    await renderHeader();
    expect(screen.queryByTestId('sync-chip')).toBeNull();
    expect(screen.queryByTestId('sync-banner')).toBeNull();
  });

  test('shows the chip and no banner while changes wait', async () => {
    mockState.current = { kind: 'waiting', count: 3 };
    await renderHeader();
    expect(screen.getAllByTestId('sync-chip')).toHaveLength(1);
    expect(screen.queryByTestId('sync-banner')).toBeNull();
  });

  test('offline: ONE chip and ONE banner that says what is waiting', async () => {
    mockState.current = { kind: 'offline', count: 3 };
    await renderHeader();
    expect(screen.getAllByTestId('sync-chip')).toHaveLength(1);
    expect(screen.getAllByTestId('sync-banner')).toHaveLength(1);
    expect(screen.getByText(/Offline\. 3 changes will sync/)).toBeTruthy();
  });

  test('after a failed sync: the chip offers Retry and the banner is calm and has Retry too', async () => {
    mockState.current = { kind: 'failed', count: 2 };
    await renderHeader();
    expect(screen.getAllByTestId('sync-chip')).toHaveLength(1);
    expect(screen.getAllByTestId('sync-banner')).toHaveLength(1);
    expect(screen.getByText(/Your trips are safe on this phone/)).toBeTruthy();
  });
});

describe('<HomeHeader> - recentre (FR-015)', () => {
  test('has no recentre control until the globe has been moved', async () => {
    await renderHeader({ moved: false });
    expect(screen.queryByTestId('home-recentre')).toBeNull();
  });

  test('offers one named control once it has, and it recentres', async () => {
    const onRecentre = jest.fn();
    await renderHeader({ moved: true, onRecentre });
    const control = screen.getByTestId('home-recentre');
    expect(control.props.accessibilityRole).toBe('button');
    expect(control.props.accessibilityLabel).toBe('Recentre the globe');
    await fireEvent.press(control);
    expect(onRecentre).toHaveBeenCalledTimes(1);
  });

  test('floats below the header and takes no room in it, so it never moves the planet', async () => {
    await renderHeader({ moved: true });
    const slot = screen.getByTestId('home-recentre-slot');
    expect(StyleSheet.flatten(slot.props.style)).toMatchObject({
      position: 'absolute',
      top: '100%',
    });
    expect(slot.parent).not.toBeNull();
  });
});

describe('<HomeHeader> - as pictured: 54 dp inset, 20 dp margins, tools at the right', () => {
  test('starts exactly at the status bar: the greeting adds its own 4 dp', async () => {
    await renderHeader();
    const style = StyleSheet.flatten(screen.getByTestId('home-header').props.style);
    expect(style.paddingTop).toBe(INSETS.top);
    expect(style.paddingHorizontal).toBe(20);
  });

  test('the search button is drawn at the right of the sync chip, 44 dp, over the sky', async () => {
    mockState.current = { kind: 'waiting', count: 3 };
    await renderHeader();
    const search = screen.getByTestId('coming-soon-search');
    expect(search.props.accessibilityRole).toBe('button');
    expect(search.props.accessibilityLabel).toBe('Search');
    expect(search.props.accessibilityHint).toBe('Not available yet');
    expect(StyleSheet.flatten(search.props.style)).toMatchObject({
      width: 44,
      height: 44,
    });
    const tools = screen.getByTestId('home-tools');
    expect(tools.children).toHaveLength(2);
    expect(StyleSheet.flatten(tools.props.style)).toMatchObject({
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    });
  });

  test('the search button is there when nothing waits to sync, and the chip is not', async () => {
    await renderHeader();
    expect(screen.getByTestId('coming-soon-search')).toBeTruthy();
    expect(screen.queryByTestId('sync-chip')).toBeNull();
  });

  test('the tree reads: date, greeting, sync chip, search, banner, recentre', async () => {
    mockState.current = { kind: 'offline', count: 3 };
    await renderHeader({ moved: true });
    const order = [
      'home-greeting-date',
      'home-greeting',
      'sync-chip',
      'coming-soon-search',
      'sync-banner',
      'home-recentre',
    ];
    const tree = JSON.stringify(screen.toJSON());
    const at = order.map((id) => tree.indexOf('"testID":"' + id + '"'));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test('pressing search shows ONE "Search is coming soon" toast and goes nowhere', async () => {
    const onRecentre = jest.fn();
    await renderHeader({ onRecentre });
    await fireEvent.press(screen.getByTestId('coming-soon-search'));
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(mockToast.show.mock.calls[0][0].id).toBe('coming-soon');
    Object.values(router).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    expect(onRecentre).not.toHaveBeenCalled();
  });

  test('at a text scale of 1.15 and up the tools stack in a column, right-aligned', async () => {
    useAppearance.mockReturnValue(appearance({ fontScale: 1.15 }));
    await renderHeader();
    expect(
      StyleSheet.flatten(screen.getByTestId('home-tools').props.style),
    ).toMatchObject({ flexDirection: 'column', alignItems: 'flex-end', gap: 8 });
    useAppearance.mockReturnValue(appearance({ fontScale: 1.14 }));
    await screen.rerender(
      <SafeAreaInsetsContext.Provider value={INSETS}>
        <HomeHeader
          name="Marta"
          today="2026-10-14"
          moved={false}
          onRecentre={jest.fn()}
          onMeasured={jest.fn()}
        />
      </SafeAreaInsetsContext.Provider>,
    );
    expect(
      StyleSheet.flatten(screen.getByTestId('home-tools').props.style),
    ).toMatchObject({ flexDirection: 'row' });
  });

  test('the recentre control sits 20 dp from the left, a little below the header edge', async () => {
    await renderHeader({ moved: true });
    expect(
      StyleSheet.flatten(screen.getByTestId('home-recentre-slot').props.style),
    ).toMatchObject({ left: 20, top: '100%', marginTop: 20 });
  });
});

describe('<HomeHeader> - as the pictures place it', () => {
  test('banner={false}: the banner is not under the greeting (the half sheet carries it), the chip stays', async () => {
    mockState.current = { kind: 'offline', count: 3 };
    await renderHeader({ banner: false });
    expect(screen.queryByTestId('sync-banner')).toBeNull();
    expect(screen.getAllByTestId('sync-chip')).toHaveLength(1);
  });

  test('the banner is under the greeting by default (peek, empty and unreadable states have no half sheet)', async () => {
    mockState.current = { kind: 'offline', count: 3 };
    await renderHeader();
    expect(screen.getAllByTestId('sync-banner')).toHaveLength(1);
  });

  test('an empty Home greets like any other: the date over "Hello, Marta" and the search disc (feature 007)', async () => {
    await renderHeader({});
    expect(screen.getByTestId('home-greeting')).toHaveTextContent('Hello, Marta');
    expect(screen.getByTestId('home-greeting-date')).not.toHaveTextContent('195');
    expect(screen.getByTestId('coming-soon-search')).toBeTruthy();
  });
});
