/**
 * `useAppActive` — the globe's beacon stops while the app is away (D-30).
 */
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useAppActive } from './use-app-active';

function captureListener() {
  const captured: { listener?: (state: AppStateStatus) => void } = {};
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    captured.listener = listener as (state: AppStateStatus) => void;
    return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return { captured, remove };
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('follows the app between the foreground and the background', async () => {
  const { captured, remove } = captureListener();
  const { result, unmount } = await renderHook(() => useAppActive());
  expect(result.current).toBe(true);

  await act(async () => captured.listener?.('background'));
  expect(result.current).toBe(false);

  await act(async () => captured.listener?.('active'));
  expect(result.current).toBe(true);

  // iOS, mid-transition (app switcher, incoming call): away as well.
  await act(async () => captured.listener?.('inactive'));
  expect(result.current).toBe(false);

  await unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

test('starts away when the app launches in the background', async () => {
  captureListener();
  // React Native's Jest setup makes `currentState` a mock function; on a
  // device it is the state string, which is what this stands in for.
  const original = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;
  Object.defineProperty(AppState, 'currentState', {
    value: 'background',
    configurable: true,
  });
  try {
    const { result } = await renderHook(() => useAppActive());
    expect(result.current).toBe(false);
  } finally {
    Object.defineProperty(AppState, 'currentState', original);
  }
});
