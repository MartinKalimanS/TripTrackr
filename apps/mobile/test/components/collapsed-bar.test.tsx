/**
 * T543 - `CollapsedBar` (contract C5-20; spec FR-025, US3 scenario 2; research D5-12): the
 * solid 56 dp bar with the title that takes the hero's place once the picture has scrolled
 * away. The Back control is the native transparent header's `headerLeft`, drawn above this
 * bar by the navigator, so there is exactly one "Back" at every scroll position (contract:
 * "one Back; the title is announced once"); the bar draws the title and the surface only.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { CollapsedBar } from '@/components/trip/collapsed-bar';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));

const hidden = { includeHiddenElements: true };
const flat = (id: string) =>
  StyleSheet.flatten(screen.getByTestId(id, hidden).props.style) as Record<
    string,
    unknown
  >;

function bar(
  insetTop = 0,
  props: Partial<React.ComponentProps<typeof CollapsedBar>> = {},
) {
  return (
    <SafeAreaInsetsContext.Provider
      value={{ top: insetTop, bottom: 0, left: 0, right: 0 }}>
      <CollapsedBar title="Portugal Road Trip" {...props} />
    </SafeAreaInsetsContext.Provider>
  );
}

describe('<CollapsedBar>', () => {
  test('draws the title, centred, in one line', async () => {
    await render(bar());
    const title = screen.getByText('Portugal Road Trip', hidden);
    expect(title.props.numberOfLines).toBe(1);
    expect(String(title.props.className)).toContain('text-center');
  });

  test('is at least 56 dp tall below the status bar, a minimum that grows with the inset', async () => {
    await render(bar(54));
    expect(flat('trip-collapsed-bar').minHeight).toBe(56 + 54);
    expect(flat('trip-collapsed-bar').height).toBeUndefined();
  });

  test('with no inset (Android under a transparent header handles its own) it is 56 dp', async () => {
    await render(bar(0));
    expect(flat('trip-collapsed-bar').minHeight).toBe(56);
  });

  test('is a solid surface with a hairline, never translucent (FR-073)', async () => {
    await render(bar(54));
    const node = screen.getByTestId('trip-collapsed-bar', hidden);
    expect(String(node.props.className)).toContain('bg-surface');
    expect(flat('trip-collapsed-bar').borderBottomWidth).toBeGreaterThan(0);
    expect(String(node.props.className)).toContain('border-separator');
  });

  test("takes no touches: the Back control above it is the navigator's", async () => {
    await render(bar());
    expect(screen.getByTestId('trip-collapsed-bar', hidden).props.pointerEvents).toBe(
      'none',
    );
  });

  test('draws no Back of its own, so there is one "Back" (and one title) on the screen', async () => {
    await render(bar());
    expect(screen.queryByLabelText('Back', hidden)).toBeNull();
    expect(screen.queryByText('Back', hidden)).toBeNull();
  });

  test('is hidden from assistive technology: the hero heading is the one announcement of the title', async () => {
    await render(bar());
    const node = screen.getByTestId('trip-collapsed-bar', hidden);
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByText('Portugal Road Trip')).toBeNull();
  });

  test('takes the scroll-driven style it is given (the fade in)', async () => {
    await render(bar(0, { style: { opacity: 0.25 } }));
    expect(flat('trip-collapsed-bar').opacity).toBe(0.25);
  });
});
