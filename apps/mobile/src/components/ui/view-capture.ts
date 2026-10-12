/**
 * `captureViewToFile` — feature 005, T533 (research D5-04, D5-19; contract C5-13 rule 2).
 *
 * The one place the app imports `react-native-view-shot`, as every native-module adapter is:
 * a view that is laid out is captured as a PNG in a temporary file and its URI is returned.
 * The photo roundels of the globe are baked this way, from a hidden laid-out view
 * (`components/globe/roundel-stage.tsx`), and a file URI is what `Images` takes. No width and
 * no height are given, so the bitmap keeps the device's pixel density. Whether a hidden view
 * captures correctly on iOS and Android, and with what colour fidelity, is the device check V2
 * (tasks T508); until it passes the roundels are off and the globe draws dots.
 *
 * A view that is not laid out rejects, as the native module does (`findNodeHandle failed to
 * resolve view`): the caller treats a rejection as "this pin stays a dot".
 */
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** What the roundel pipeline captures through: a swap point for tests and for the fallback. */
export type CaptureView = (view: RefObject<View | null>) => Promise<string>;

export const captureViewToFile: CaptureView = (view) =>
  captureRef(view, { format: 'png', result: 'tmpfile' });
