/**
 * T423 - contract C4-9 (`HeaderBackButton`), FR-008, FR-026, research D4-06 and the
 * "Items to verify" item 7. Maestro flows say `tapOn: 'Back'`, so the accessible name
 * is a promise: it is "Back" whatever the previous screen was called.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Colors, MinTouchTarget } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { HeaderBackButton } from './header-back-button';

// `mock`-prefixed so Jest's hoisted factory may reference it.
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    elevationProfile: 'flat',
    tokens: Colors.light,
    ...overrides,
  } as AppearanceContext);
}

beforeEach(() => mockAppearance());

const hidden = { includeHiddenElements: true };

describe('<HeaderBackButton> - FR-008, contract C4-9', () => {
  test('is a button named "Back"', async () => {
    await render(<HeaderBackButton />);
    const node = screen.getByLabelText('Back');
    expect(node.props.accessibilityRole).toBe('button');
  });

  test('shows a chevron and the word Back', async () => {
    await render(<HeaderBackButton testID="back" />);
    expect(screen.getByText('Back')).toBeTruthy();
    const chevron = screen.getByTestId('back-icon', hidden);
    expect(chevron.props.accessible).toBe(false);
  });

  test('forwards testID to the pressable node', async () => {
    await render(<HeaderBackButton testID="header-back" />);
    expect(screen.getByTestId('header-back').props.accessibilityLabel).toBe('Back');
  });

  test('goes back through the router by default', async () => {
    await render(<HeaderBackButton />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('a caller onPress replaces the default', async () => {
    const onPress = jest.fn();
    await render(<HeaderBackButton onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('does not render when navigation says there is nothing to go back to', async () => {
    await render(<HeaderBackButton canGoBack={false} />);
    expect(screen.queryByLabelText('Back')).toBeNull();
  });

  test('renders when navigation says it can go back', async () => {
    await render(<HeaderBackButton canGoBack />);
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });
});

describe('<HeaderBackButton> as a stack headerLeft', () => {
  test('takes the props React Navigation hands a headerLeft, and keeps its name', async () => {
    const headerLeft = (props: Record<string, unknown>) => (
      <HeaderBackButton {...props} />
    );
    await render(
      headerLeft({
        tintColor: 'ignored',
        label: 'Trips',
        href: '/trips',
        canGoBack: true,
      }),
    );
    // The previous screen's title is never the name: "Back" is what the flows tap.
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.queryByLabelText('Trips')).toBeNull();
  });

  test('keeps the platform minimum at the default text size', async () => {
    await render(<HeaderBackButton />);
    const style = StyleSheet.flatten(screen.getByLabelText('Back').props.style);
    expect(style.minHeight).toBe(MinTouchTarget);
    expect(style.minWidth).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test('does not outgrow the fixed-height header at the largest text size', async () => {
    mockAppearance({ fontScale: 2 });
    await render(<HeaderBackButton />);
    const style = StyleSheet.flatten(screen.getByLabelText('Back').props.style);
    expect(style.minHeight).toBe(MinTouchTarget);
  });

  test('lays the chevron and the word out in a row', async () => {
    await render(<HeaderBackButton />);
    expect(String(screen.getByLabelText('Back').props.className)).toEqual(
      expect.stringContaining('flex-row'),
    );
  });
});
