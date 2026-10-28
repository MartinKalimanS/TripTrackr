/**
 * F5 `PinnedStrip` (UI-SPEC section 6; trip-collapsed.png): the day chips scroll with the
 * content and then stay under the collapsed bar with 12 dp of air above them, 8 below and a
 * hairline closing the strip. One instance of the children, whatever the scroll offset.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { PinnedStrip } from '@/components/trip/pinned-strip';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));

const hidden = { includeHiddenElements: true };
const flat = (id: string) =>
  StyleSheet.flatten(screen.getByTestId(id, hidden).props.style) as Record<
    string,
    unknown
  >;

function strip(scrollY: number, onHeight?: (height: number) => void) {
  return (
    <PinnedStrip
      anchorY={{ value: 500 } as never}
      scrollY={{ value: scrollY } as never}
      pinLine={122}
      onHeight={onHeight}>
      <Text>chips</Text>
    </PinnedStrip>
  );
}

describe('<PinnedStrip>', () => {
  test('is laid over its anchor and follows the content until the pin line', async () => {
    await render(strip(100));
    expect(flat('trip-days-pin').transform).toEqual([{ translateY: 400 }]);
  });

  test('is held at the pin line once the anchor reaches it', async () => {
    await render(strip(900));
    expect(flat('trip-days-pin').transform).toEqual([{ translateY: 122 }]);
  });

  test('paints 12 dp of ground above the chips and 8 dp below, and takes no touches', async () => {
    await render(strip(900));
    const ground = screen.getByTestId('trip-days-pin-ground', hidden);
    expect(String(ground.props.className)).toContain('bg-surface');
    expect(ground.props.pointerEvents).toBe('none');
    expect(flat('trip-days-pin-ground')).toMatchObject({ top: -12, bottom: -8 });
  });

  test('draws the hairline only while the strip is held, 8 dp under the chips', async () => {
    const view = await render(strip(100));
    expect(flat('trip-days-pin-hairline').opacity).toBe(0);
    await view.rerender(strip(900));
    expect(flat('trip-days-pin-hairline').opacity).toBe(1);
    expect(flat('trip-days-pin-hairline')).toMatchObject({ bottom: -8 });
    expect(
      String(screen.getByTestId('trip-days-pin-hairline', hidden).props.className),
    ).toContain('bg-separator');
  });

  test('lets touches through where it has nothing and draws its children once', async () => {
    await render(strip(0));
    expect(screen.getByTestId('trip-days-pin').props.pointerEvents).toBe('box-none');
    expect(screen.getAllByText('chips')).toHaveLength(1);
  });
});
