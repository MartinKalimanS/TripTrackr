/**
 * F4 - `ToastZone` (trips-toast.png; UI-SPEC 3.4 "Toast": 16 dp from the sides, 8 above the
 * tab zone). The kit's provider places every toast from ONE set of insets, set where the
 * provider is; a tab screen that floats controls above the pill gives its own, so the toast
 * stands clear of the pill and the button lifts above it.
 */
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  TOAST_ABOVE_ZONE,
  TOAST_SIDE_MARGIN,
  ToastZone,
  toastZoneInsets,
  useToastVisible,
} from './toast-zone';

describe('toastZoneInsets: where the toast stands', () => {
  test('8 dp above the zone the tab pill takes, 16 dp from the sides', () => {
    expect(toastZoneInsets(88, { left: 0, right: 0 })).toEqual({
      top: 0,
      bottom: 88 + TOAST_ABOVE_ZONE,
      left: TOAST_SIDE_MARGIN,
      right: TOAST_SIDE_MARGIN,
    });
    expect(TOAST_ABOVE_ZONE).toBe(8);
    expect(TOAST_SIDE_MARGIN).toBe(16);
  });

  test('keeps clear of a side inset (a notch in landscape)', () => {
    expect(toastZoneInsets(0, { left: 44, right: 0 })).toMatchObject({
      left: 16 + 44,
      right: 16,
    });
  });
});

describe('<ToastZone>', () => {
  test('draws what it wraps, and says no toast is up until one is shown', async () => {
    function Probe() {
      return <Text testID="probe">{useToastVisible() ? 'up' : 'none'}</Text>;
    }
    await render(
      <ToastZone bottom={88}>
        <Probe />
      </ToastZone>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });
});
