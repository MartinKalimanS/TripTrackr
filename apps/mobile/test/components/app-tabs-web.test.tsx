/**
 * Coverage for the web tab bar (`app-tabs.web.tsx`).
 *
 * Imported by explicit path: Jest resolves the native `.tsx` by default, so the
 * web variant would otherwise ship untested. `TabButton` and `CustomTabList`
 * are exported precisely so they can be exercised without a router.
 */
import { render } from '@testing-library/react-native';

import { CustomTabList, TabButton } from '@/components/app-tabs.web';

jest.mock('expo-router/ui', () => {
  const { View } = require('react-native');
  const passthrough =
    (testID: string) =>
    ({ children }: { children?: React.ReactNode }) => (
      <View testID={testID}>{children}</View>
    );
  return {
    Tabs: passthrough('tabs'),
    TabList: passthrough('tab-list'),
    TabTrigger: passthrough('tab-trigger'),
    TabSlot: passthrough('tab-slot'),
  };
});

// ExternalLink wraps expo-router's <Link>, which needs a navigation context to
// mount. The tab list's own layout is what is under test here.
jest.mock('@/components/external-link', () => {
  const { View } = require('react-native');
  return {
    ExternalLink: ({ children }: { children?: React.ReactNode }) => (
      <View testID="external-link">{children}</View>
    ),
  };
});

jest.mock('expo-symbols', () => {
  const { View } = require('react-native');
  return { SymbolView: () => <View testID="symbol" /> };
});

describe('web tab bar', () => {
  test('renders a tab button with its label', async () => {
    const view = await render(<TabButton>Home</TabButton>);
    expect(view.getByText('Home')).toBeTruthy();
  });

  test('conveys selection by depth direction, not hue alone (FR-010)', async () => {
    const focused = await render(<TabButton isFocused>Home</TabButton>);
    const focusedTree = JSON.stringify(focused.toJSON());

    const resting = await render(<TabButton>Home</TabButton>);
    const restingTree = JSON.stringify(resting.toJSON());

    // Focused renders recessed, resting renders raised — a difference in the
    // shadow recipe, not merely a different colour.
    expect(focusedTree).not.toBe(restingTree);
    expect(focusedTree).toContain('inset');
  });

  test('renders the tab list shell without a router present', async () => {
    const view = await render(<CustomTabList />);
    const tree = JSON.stringify(view.toJSON()) ?? '';

    expect(tree.length).toBeGreaterThan(0);
    expect(tree).toContain('Expo Starter');
  });
});
