/**
 * `captureViewToFile` — feature 005, T533 (research D5-04, D5-19; contract C5-13 rule 2:
 * only `components/ui/` imports `react-native-view-shot`).
 *
 * The adapter the roundel pipeline captures through. Under Jest the module is the stand-in
 * of `test/mocks/react-native-view-shot.tsx`; what a real capture of a hidden laid-out view
 * looks like is the device check V2 (tasks T508).
 */
import type { RefObject } from 'react';
import type { View } from 'react-native';

import { captureViewToFile } from './view-capture';

const { captureRef } = jest.requireMock('react-native-view-shot') as {
  captureRef: jest.Mock;
};

const laidOut = { current: {} } as unknown as RefObject<View | null>;

beforeEach(() => captureRef.mockClear());

describe('captureViewToFile', () => {
  test('captures the view as a PNG in a temporary file, at its own pixel size', async () => {
    const uri = await captureViewToFile(laidOut);
    expect(captureRef).toHaveBeenCalledTimes(1);
    expect(captureRef).toHaveBeenCalledWith(laidOut, {
      format: 'png',
      result: 'tmpfile',
    });
    expect(uri).toBe('file:///cache/ReactNative-snapshot-image.png');
  });

  test('has no width or height of its own: the bitmap keeps the device’s pixel density', async () => {
    await captureViewToFile(laidOut);
    const options = captureRef.mock.calls[0]![1] as Record<string, unknown>;
    expect(options).not.toHaveProperty('width');
    expect(options).not.toHaveProperty('height');
  });

  test('refuses a view that is not laid out, with the reason, as a rejected promise', async () => {
    await expect(captureViewToFile({ current: null })).rejects.toThrow(/findNodeHandle/);
  });
});
