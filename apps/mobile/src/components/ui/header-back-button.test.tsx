/**
 * T423 - contract C4-9 (`HeaderBackButton`), FR-008, FR-026, FR-029, research D4-06 and the
 * "Items to verify" item 7. Maestro flows say `tapOn: 'Back'`, so the accessible name
 * is a promise: it is "Back" whatever the previous screen was called, and whatever the
 * text size.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';

import { HeaderBackButton } from './header-back-button';

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: mockCanGoBack,
    replace: mockReplace,
    push: jest.fn(),
  }),
}));
// The adapter reads the font scale from the window, not from `useAppearance` (tappable.tsx).
jest.mock('@/hooks/use-appearance', () => ({ useAppearance: jest.fn() }));

/** Sets the window font scale `useWindowDimensions` reports. */
function mockFontScale(fontScale: number) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale,
  });
}

beforeEach(() => {
  mockFontScale(1);
  mockCanGoBack.mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

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

  test('a caller onPress replaces the default', async () => {
    const onPress = jest.fn();
    await render(<HeaderBackButton onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
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

describe('<HeaderBackButton> default press', () => {
  test('goes back through the router when there is somewhere to go', async () => {
    mockCanGoBack.mockReturnValue(true);
    await render(<HeaderBackButton />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('replaces with the home when the screen was opened with no history (a deep link)', async () => {
    mockCanGoBack.mockReturnValue(false);
    await render(<HeaderBackButton />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('asks the router at press time, not at render time', async () => {
    mockCanGoBack.mockReturnValue(true);
    await render(<HeaderBackButton />);
    mockCanGoBack.mockReturnValue(false);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('<HeaderBackButton> at the largest text size - FR-029', () => {
  test('shows the word at the default text size', async () => {
    mockFontScale(1);
    await render(<HeaderBackButton testID="back" />);
    expect(screen.getByText('Back')).toBeTruthy();
  });

  test('shows the word up to a 1.3 font scale', async () => {
    mockFontScale(1.3);
    await render(<HeaderBackButton testID="back" />);
    expect(screen.getByText('Back')).toBeTruthy();
  });

  test('hides the word above 1.3 so a fixed-height header does not clip it', async () => {
    mockFontScale(2);
    await render(<HeaderBackButton testID="back" />);
    expect(screen.queryByText('Back')).toBeNull();
    expect(screen.queryByText('Back', hidden)).toBeNull();
  });

  test('keeps the name "Back" and the chevron when the word is hidden', async () => {
    mockFontScale(2);
    await render(<HeaderBackButton testID="back" />);
    const node = screen.getByLabelText('Back');
    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityLabel).toBe('Back');
    expect(screen.getByTestId('back-icon', hidden)).toBeTruthy();
  });

  test('still goes back when only the chevron is shown', async () => {
    mockFontScale(2);
    await render(<HeaderBackButton />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('is still a platform-minimum target when only the chevron is shown', async () => {
    mockFontScale(2);
    await render(<HeaderBackButton />);
    const style = StyleSheet.flatten(screen.getByLabelText('Back').props.style);
    expect(style.minHeight).toBe(MinTouchTarget);
    expect(style.minWidth).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test('never subscribes to useAppearance', async () => {
    await render(<HeaderBackButton />);
    expect(useAppearance).not.toHaveBeenCalled();
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
    mockFontScale(2);
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
