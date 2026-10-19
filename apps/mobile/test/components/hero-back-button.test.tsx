/**
 * T546 - `HeroBackButton` (contract C5-20; screens.md "Trip"; spec FR-007, FR-025, FR-071,
 * FR-081): the Back control over the trip's picture, the `headerLeft` of the transparent native
 * header. A 44 dp disc on a dark translucent fill with a white chevron, because a control
 * floating over a photograph sits on a disc (FR-007); named "Back" whatever the previous screen
 * is called, so `tapOn: 'Back'` in the Maestro flows resolves; it goes back, or home when the
 * trip was opened with nothing beneath it (it never vanishes: the props the navigator passes to
 * `headerLeft` are not forwarded, as `HeaderBackButton`'s are not).
 *
 * LOCAL SEAM: the chrome branch (T528) restyles `HeaderBackButton` with a `glass` variant for the
 * hero. Until it lands, this is the glass `IconButton` with the same behaviour; when it does the
 * header option in `_layout.tsx` swaps to it and this file goes.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { StyleSheet } from 'react-native';

import { HeroBackButton } from '@/components/trip/hero-back-button';

import { glyphsIn } from '../helpers/icons';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack,
  }),
}));

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  mockBack.mockReset();
  mockReplace.mockReset();
  mockCanGoBack = true;
});

describe('<HeroBackButton>', () => {
  test('is ONE button named "Back", and says nothing else', async () => {
    await render(<HeroBackButton />);
    const back = screen.getByLabelText('Back');
    expect(back.props.accessibilityRole).toBe('button');
    expect(screen.getAllByLabelText('Back')).toHaveLength(1);
    expect(screen.queryByText('Back')).toBeNull();
  });

  test('draws a white chevron on the dark translucent disc a control over a photograph sits on', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string | string[]) =>
        Array.isArray(token)
          ? token.map((name) => `colour:${name}`)
          : `colour:${token}`) as never);
    await render(<HeroBackButton />);
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: 'chevron-left', color: 'colour:on-photo' }),
    ]);
    expect(StyleSheet.flatten(screen.getByLabelText('Back').props.style)).toMatchObject({
      backgroundColor: 'colour:scrim-button',
      borderColor: 'colour:scrim-button-line',
    });
  });

  test('goes back to where the traveller came from', async () => {
    await render(<HeroBackButton />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('goes home when the trip was opened with nothing beneath it (a deep link)', async () => {
    mockCanGoBack = false;
    await render(<HeroBackButton />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
