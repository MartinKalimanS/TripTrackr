/**
 * T548 - `AreaHeader` (FR-044; UI-SPEC 9.2; pictures `more/photos`, `notes`, `documents`):
 * Back as the tonal 44 dp disc named "Back", the title, the one-line subtitle, the optional
 * "Only you" chip and the controls at the end of the bar, below the status bar.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Text } from './text';
import { AreaHeader, areaMargin } from './area-header';

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

const flat = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack.mockReturnValue(true);
});

describe('<AreaHeader>', () => {
  test('draws the title as a header and the subtitle under it, each with its id', async () => {
    await render(
      <AreaHeader
        title="Photos"
        subtitle="Portugal Road Trip · 128 photos"
        testID="area"
        titleTestID="area-title"
        subtitleTestID="area-subtitle"
      />,
    );

    expect(screen.getByTestId('area-title')).toHaveTextContent('Photos');
    expect(screen.getByRole('header', { name: 'Photos' })).toBeOnTheScreen();
    expect(screen.getByTestId('area-subtitle')).toHaveTextContent(
      'Portugal Road Trip · 128 photos',
    );
  });

  test('the subtitle is one line that ends in an ellipsis; a missing one is not drawn', async () => {
    await render(
      <AreaHeader title="Photos" subtitle="x" subtitleTestID="area-subtitle" />,
    );
    const subtitle = screen.getByTestId('area-subtitle');
    expect(subtitle.props.numberOfLines).toBe(1);
    expect(subtitle.props.ellipsizeMode).toBe('tail');

    await screen.rerender(
      <AreaHeader title="Photos" subtitle={null} subtitleTestID="area-subtitle" />,
    );
    expect(screen.queryByTestId('area-subtitle')).toBeNull();
  });

  test('Back is the one control named exactly "Back"; it goes back, or home with nothing beneath', async () => {
    await render(<AreaHeader title="Photos" />);
    expect(screen.getAllByLabelText('Back')).toHaveLength(1);

    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);

    mockCanGoBack.mockReturnValue(false);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('onBack replaces the default', async () => {
    const onBack = jest.fn();
    await render(<AreaHeader title="Photos" onBack={onBack} />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('the actions are drawn at the end of the bar, after the chip', async () => {
    await render(
      <AreaHeader
        title="Documents"
        privacy
        actions={<Text testID="more-action">more</Text>}
      />,
    );

    const chip = screen.getByTestId('privacy-chip');
    expect(chip).toHaveAccessibleName('Only you can see this');
    const bar = chip.parent?.parent;
    const order = bar?.children
      .flatMap((child) => (typeof child === 'string' ? [] : [child]))
      .flatMap((child) => child.children)
      .map((child) => (typeof child === 'string' ? '' : String(child.props.testID)));
    expect(order?.indexOf('privacy-chip')).toBeLessThan(
      order?.indexOf('more-action') ?? -1,
    );
  });

  test('without the chip no lock is drawn (Photos is not "Only you" in the picture)', async () => {
    await render(<AreaHeader title="Photos" />);
    expect(screen.queryByTestId('privacy-chip')).toBeNull();
  });

  test('sits below the status bar, 20 dp from the sides', async () => {
    await render(
      <SafeAreaInsetsContext.Provider value={{ top: 47, bottom: 34, left: 0, right: 0 }}>
        <AreaHeader title="Photos" testID="area" />
      </SafeAreaInsetsContext.Provider>,
    );
    const style = flat(screen.getByTestId('area'));
    expect(style.paddingTop).toBe(47 + 4);
    expect(style.paddingStart).toBe(20);
    expect(style.paddingEnd).toBe(20);
  });

  test('the margin is 20 dp, 16 dp on Android, and the header uses it', async () => {
    expect(areaMargin('ios')).toBe(20);
    expect(areaMargin('android')).toBe(16);
    const platform = jest.replaceProperty(Platform, 'OS', 'android');
    await render(<AreaHeader title="Photos" testID="area" />);
    expect(flat(screen.getByTestId('area')).paddingStart).toBe(16);
    platform.restore();
  });

  test('a notch at the side pushes the margins in', async () => {
    await render(
      <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 44, right: 44 }}>
        <AreaHeader title="Photos" testID="area" />
      </SafeAreaInsetsContext.Provider>,
    );
    const style = flat(screen.getByTestId('area'));
    expect(style.paddingStart).toBe(64);
    expect(style.paddingEnd).toBe(64);
  });
});
