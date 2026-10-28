/**
 * `useReachAllDistance` (feature 005, T560; SC-015): a list keeps its default draw distance with
 * no screen reader, mounts everything while one is on, follows it being switched on or off live,
 * and a list that did not ask subscribes to nothing.
 */
import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReachAllDistance, useScreenReaderEnabled } from './use-reach-all';

type Listener = (enabled: boolean) => void;

let listener: Listener | null = null;
const remove = jest.fn();

function screenReader(on: boolean) {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(on);
  return jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((_event: string, handler: unknown) => {
      listener = handler as Listener;
      return { remove } as never;
    });
}

beforeEach(() => {
  listener = null;
  remove.mockReset();
});
afterEach(() => {
  screenReader(false);
  jest.restoreAllMocks();
});

describe('useReachAllDistance', () => {
  test('is undefined with no screen reader: the list keeps its own default', async () => {
    screenReader(false);
    const { result } = await renderHook(() => useReachAllDistance(30));
    expect(result.current).toBeUndefined();
  });

  test('covers every row while a screen reader is on, however short or long the list', async () => {
    screenReader(true);
    const { result, rerender } = await renderHook(
      (props: { count: number }) => useReachAllDistance(props.count),
      { initialProps: { count: 30 } },
    );
    expect(result.current).toBeGreaterThanOrEqual(30 * 200);
    await rerender({ count: 200 });
    expect(result.current).toBeGreaterThanOrEqual(200 * 200);
    await rerender({ count: 0 });
    expect(result.current).toBeGreaterThan(0);
  });

  test('follows the screen reader being switched on and off with the app open', async () => {
    screenReader(false);
    const { result } = await renderHook(() => useReachAllDistance(10));
    expect(result.current).toBeUndefined();
    await act(async () => listener?.(true));
    expect(result.current).toBeGreaterThan(0);
    await act(async () => listener?.(false));
    expect(result.current).toBeUndefined();
  });

  test('stops listening when the list goes', async () => {
    screenReader(true);
    const { unmount } = await renderHook(() => useScreenReaderEnabled());
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('a list that did not ask subscribes to nothing and reads as off', async () => {
    const add = screenReader(true);
    const { result } = await renderHook(() => useReachAllDistance(30, false));
    expect(result.current).toBeUndefined();
    expect(add).not.toHaveBeenCalled();
  });
});
