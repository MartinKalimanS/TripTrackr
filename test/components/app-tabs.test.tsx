/**
 * Coverage for the tab bar — FR-023.
 *
 * This is where the half-converted white bar was found: `app-tabs.tsx` reads
 * `Colors` directly rather than going through a treatment, so no token test
 * could see it. These assertions pin it to the neumorphic ramp.
 *
 * `NativeTabs` needs a router layout context to mount, so it is replaced with
 * inert host components. The component's own colour decisions — the thing under
 * test — are unaffected.
 */
import { render } from '@testing-library/react-native';

import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';

jest.mock('expo-router/unstable-native-tabs', () => {
  const { View, Text } = require('react-native');
  const NativeTabs = ({ children, ...props }: Record<string, unknown>) => (
    <View testID="native-tabs" {...props}>
      {children as React.ReactNode}
    </View>
  );
  const Trigger = ({ children }: { children?: React.ReactNode }) => (
    <View>{children}</View>
  );
  Trigger.Label = ({ children }: { children?: React.ReactNode }) => (
    <Text>{children}</Text>
  );
  Trigger.Icon = () => <View />;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});

describe('<AppTabs> — FR-023', () => {
  test('paints the canvas, not the legacy white background', async () => {
    const view = await render(<AppTabs />);
    const bar = view.getByTestId('native-tabs');

    expect(bar.props.backgroundColor).toBe(Colors.light.canvas);
    // The legacy token is exactly what produced a white bar against grey content.
    expect(bar.props.backgroundColor).not.toBe(Colors.light.background);
  });

  test('uses the neumorphic ink and indicator tokens', async () => {
    const view = await render(<AppTabs />);
    const bar = view.getByTestId('native-tabs');

    expect(bar.props.indicatorColor).toBe(Colors.light.surfaceSunk);
    expect(bar.props.labelStyle).toEqual({
      selected: { color: Colors.light.textPrimary },
    });
  });

  test('renders both tab triggers', async () => {
    const view = await render(<AppTabs />);
    expect(view.getByText('Home')).toBeTruthy();
    expect(view.getByText('Explore')).toBeTruthy();
  });
});
