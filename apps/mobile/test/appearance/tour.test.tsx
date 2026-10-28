/**
 * Feature 007 (T703) - the appearance sweep of the first-run tour: token colours only in the four
 * themes, and nothing translucent but the dim (the `backdrop` scrim of `allow-list.ts`) in the
 * contrast themes and under reduced transparency (FR-008, FR-072, FR-073, SC-008). It is a
 * component over the tabs rather than a route, so it is listed here and not in the inventory.
 */
import { act } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { TourOverlay } from '@/components/tour/tour-overlay';
import { registerTourTarget } from '@/components/tour/tour-targets';
import { useTourStore } from '@/features/tour/tour-store';

import { sweepScreen } from './sweep';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-live'));

const node = (x: number, y: number, width: number, height: number) => ({
  measureInWindow: (done: (...box: number[]) => void) => done(x, y, width, height),
});

sweepScreen(
  'The first-run tour',
  () => <TourOverlay onClosed={() => undefined} />,
  () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
    registerTourTarget('totals', node(20, 520, 350, 90));
    useTourStore.setState({ open: true, step: 0 });
  },
  () => act(async () => undefined),
);
