/**
 * Where the callout goes while the camera moves — feature 005, T533 (FR-011).
 *
 * The callout's side depends on where the pin is on the SCREEN, which the map knows
 * (`MapView.getPointInView`, asked for in a promise). It is asked when the camera settles
 * (`refresh`, from `onMapIdle`), when the pin moves to another place and when the card's size
 * becomes known, never per frame.
 */
import { act, renderHook } from '@testing-library/react-native';

import { GlobeLayers } from '@/constants/theme';

import type { CalloutArea } from '../callout-layout';
import { useCalloutPlacement } from '../use-callout-placement';

const AREA: CalloutArea = { left: 0, right: 390, top: 110, bottom: 632 };
const RING = 32;

function fakeMap(point: [number, number]) {
  const state = { point };
  const getPointInView = jest.fn(async () => state.point);
  return { state, getPointInView, ref: { current: { getPointInView } } };
}

const hook = (
  map: ReturnType<typeof fakeMap>,
  coordinate: [number, number] | null = [1, 2],
) =>
  renderHook(
    (props: { coordinate: [number, number] | null }) =>
      useCalloutPlacement({
        map: map.ref,
        coordinate: props.coordinate,
        area: AREA,
        ringSize: RING,
      }),
    { initialProps: { coordinate } },
  );

describe('useCalloutPlacement', () => {
  test('starts on the left at the full width, before the map has answered', async () => {
    const map = fakeMap([300, 350]);
    const { result } = await hook(map);
    expect(result.current.side).toBe('left');
    expect(result.current.maxWidth).toBe(GlobeLayers.callout.maxWidth);
  });

  test('asks the map where the pin is, once, when it appears', async () => {
    const map = fakeMap([300, 350]);
    await hook(map);
    await act(async () => {});
    expect(map.getPointInView).toHaveBeenCalledTimes(1);
    expect(map.getPointInView).toHaveBeenCalledWith([1, 2]);
  });

  test('flips to the right when the pin is near the left edge', async () => {
    const map = fakeMap([60, 350]);
    const { result } = await hook(map);
    await act(async () => {});
    expect(result.current.side).toBe('right');
  });

  test('moves with the pin when the camera settles: refresh asks again', async () => {
    const map = fakeMap([300, 350]);
    const { result } = await hook(map);
    await act(async () => {});
    expect(result.current.side).toBe('left');

    map.state.point = [60, 350];
    await act(async () => {
      result.current.refresh();
    });
    expect(result.current.side).toBe('right');
    expect(map.getPointInView).toHaveBeenCalledTimes(2);
  });

  test('asks again when the pin moves to another place', async () => {
    const map = fakeMap([300, 350]);
    const { rerender } = await hook(map);
    await act(async () => {});
    await rerender({ coordinate: [5, 6] });
    await act(async () => {});
    expect(map.getPointInView).toHaveBeenLastCalledWith([5, 6]);
  });

  test('uses the size of the card once it is known: a wider card needs more room', async () => {
    const map = fakeMap([240, 350]);
    const { result } = await hook(map);
    await act(async () => {});
    await act(async () => {
      result.current.onCardLayout({ width: 120, height: 54 });
    });
    expect(result.current.side).toBe('left');

    await act(async () => {
      result.current.onCardLayout({ width: 220, height: 54 });
    });
    expect(result.current.side).not.toBe('left');
  });

  test('keeps the widest the card has been, so a narrowed card does not shrink its own room', async () => {
    // 300 dp wide, the pin 60 dp from the left edge: nothing fits a 220 dp card, so the card
    // is narrowed to the 198 dp to the right of the pin.
    const map = fakeMap([60, 350]);
    const { result } = await renderHook(() =>
      useCalloutPlacement({
        map: map.ref,
        coordinate: [1, 2],
        area: { ...AREA, right: 300 },
        ringSize: RING,
      }),
    );
    await act(async () => {});
    await act(async () => {
      result.current.onCardLayout({ width: 220, height: 54 });
    });
    const narrowed = result.current.maxWidth;
    expect(narrowed).toBe(198);
    // The card now reports the narrowed width; that must not shrink its own room further.
    await act(async () => {
      result.current.onCardLayout({ width: narrowed, height: 54 });
    });
    expect(result.current.maxWidth).toBe(narrowed);
  });

  test('does nothing without a coordinate, and nothing the stand-in map cannot do', async () => {
    const map = fakeMap([300, 350]);
    await hook(map, null);
    await act(async () => {});
    expect(map.getPointInView).not.toHaveBeenCalled();

    const { result } = await renderHook(() =>
      useCalloutPlacement({
        map: { current: {} },
        coordinate: [1, 2],
        area: AREA,
        ringSize: RING,
      }),
    );
    await act(async () => {});
    expect(result.current.side).toBe('left');
  });

  test('a map that fails to answer leaves the placement where it was', async () => {
    const getPointInView = jest.fn(async () => {
      throw new Error('map is off-window');
    });
    const { result } = await renderHook(() =>
      useCalloutPlacement({
        map: { current: { getPointInView } },
        coordinate: [1, 2],
        area: AREA,
        ringSize: RING,
      }),
    );
    await act(async () => {});
    expect(result.current.side).toBe('left');
  });

  test('does not set state after it has gone away', async () => {
    let resolve: (point: [number, number]) => void = () => {};
    const getPointInView = jest.fn(
      () => new Promise<[number, number]>((r) => (resolve = r)),
    );
    const error = jest.spyOn(console, 'error').mockImplementation();
    const { unmount } = await renderHook(() =>
      useCalloutPlacement({
        map: { current: { getPointInView } },
        coordinate: [1, 2],
        area: AREA,
        ringSize: RING,
      }),
    );
    await unmount();
    await act(async () => resolve([60, 350]));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
