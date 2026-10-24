/**
 * T559 - the Photos route, in every state it has (FR-064, FR-066, FR-080 as amended by Q-11):
 * loading, unreadable, empty, the grid, an upload that failed, what a capture came to and the
 * camera refused for good. In each: no control that does nothing, no control that says it is
 * not available yet without being a coming-soon control (and the reverse), at most ONE primary
 * ("Add photos").
 *
 * The live hooks and the capture hook are the photo suites' (`photo-screen-harness.tsx`).
 */
import { render, screen } from '@testing-library/react-native';

import PhotosScreen from '@/app/trip/[id]/photos';

import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';
import {
  failed,
  mockCapture,
  mockPhotos,
  pending,
  resetPhotoScreen,
  uploaded,
} from '../app/photo-screen-harness';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'trip-42' }),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));
jest.mock('expo-file-system', () =>
  jest.requireActual('../features/photo-fakes').createFileSystemMock(),
);
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/features/trips/use-trips', () =>
  require('../app/photo-screen-harness').tripsModule(),
);
jest.mock('@/features/photos/use-photos', () =>
  require('../app/photo-screen-harness').photosModule(),
);
jest.mock('@/features/photos/use-capture', () =>
  require('../app/photo-screen-harness').captureModule(),
);

beforeEach(resetPhotoScreen);

/** What every state of every route owes the traveller. */
function expectHealthy() {
  expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  expect(primaryControls().length).toBeLessThanOrEqual(1);
}

describe('Photos states: no control is a dead end', () => {
  it('loading: a skeleton, and the header with its controls', async () => {
    mockPhotos.loading = true;
    await render(<PhotosScreen />);
    expect(screen.getByLabelText('Loading photos')).toBeTruthy();
    expectHealthy();
  });

  it('unreadable: words, an icon and "Try again"', async () => {
    mockPhotos.error = new Error('database is locked');
    await render(<PhotosScreen />);
    expect(screen.getByText('Couldn’t read the photos')).toBeTruthy();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
    expectHealthy();
  });

  it('empty: three empty frames, "No photos yet" and "Add photos", the one primary', async () => {
    await render(<PhotosScreen />);
    expect(screen.getByText('No photos yet')).toBeTruthy();
    expectHealthy();
    expect(primaryControls()).toEqual(['"Add photos from your library"']);
  });

  it('the grid: uploaded, waiting and failed photographs', async () => {
    mockPhotos.data = [uploaded, pending, failed];
    await render(<PhotosScreen />);
    expectHealthy();
  });

  it('what a capture came to: a notice with Dismiss', async () => {
    mockPhotos.data = [uploaded];
    mockCapture.message = { tone: 'info', text: '3 photos added.' };
    await render(<PhotosScreen />);
    expect(screen.getByTestId('photos-capture-message')).toBeTruthy();
    expectHealthy();
  });

  it('the camera refused for good: Open Settings and Dismiss, still one primary', async () => {
    mockCapture.message = {
      tone: 'error',
      text: 'Camera access is turned off for TripTrackr. You can turn it on in Settings.',
      openSettings: true,
    };
    await render(<PhotosScreen />);
    expect(screen.getByTestId('photos-camera-denied')).toBeTruthy();
    expectHealthy();
  });
});
