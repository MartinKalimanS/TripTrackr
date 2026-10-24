/**
 * T560 - the reading order of the photographs of a trip (feature 005; FR-044, FR-045, FR-070,
 * FR-075, FR-076, SC-015; UI-SPEC 9.2): Back and the header's controls, the heading and its line,
 * the upload summary in words, the days as headings over their photographs, the privacy line,
 * the floating "Add photos" last. Every photograph is ONE button named with its date, place and
 * upload state (never colour alone). Rendered like `photo-gallery-pictured.test.tsx`.
 */
import { render } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import PhotosScreen from '@/app/trip/[id]/photos';
import type { PhotoWithPlace } from '@/db/repositories/photos';

import {
  accessibleNodes,
  exposedArt,
  expectReadingOrder,
  unnamed,
} from '../helpers/a11y-nodes';
import { resetKeyboard } from '../helpers/keyboard';
import {
  failed,
  mockPhotos,
  pending,
  photo,
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

/** The window a 390 by 844 phone reports, at a text scale. */
function phone(fontScale = 1) {
  jest
    .spyOn(Dimensions, 'get')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
}

beforeEach(() => {
  resetPhotoScreen();
  phone();
});
afterEach(() => {
  resetKeyboard();
  jest.restoreAllMocks();
});

const idOf = (shown: PhotoWithPlace) => `photo-open-${shown.id}`;
const OLDER = photo('dddddddd', { taken_at: '2026-05-11T12:00:00.000Z' });

describe('Photos reading order', () => {
  test('Back, the header, the summary, each day over its photographs, the privacy line, then Add photos', async () => {
    mockPhotos.data = [pending, failed, uploaded, OLDER];
    await render(<PhotosScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'Back',
      'photos-take',
      'photos-title',
      'photos-subtitle',
      /waiting to upload/,
      /failed/,
      'photos-retry-failed',
      'day-header-2026-05-12',
      idOf(pending),
      idOf(failed),
      idOf(uploaded),
      'day-header-2026-05-11',
      idOf(OLDER),
      /^Private/,
      'photos-add',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('every photograph is reachable as a button that says where it is in its upload', async () => {
    mockPhotos.data = [pending, failed, uploaded, OLDER];
    await render(<PhotosScreen />);
    const tiles = accessibleNodes().filter((node) => node.id?.startsWith('photo-open-'));
    expect(tiles).toHaveLength(4);
    expect(tiles.every((node) => node.role === 'button')).toBe(true);
    expect(tiles[0]!.name).toMatch(/Waiting to upload/);
    expect(tiles[1]!.name).toMatch(/Upload failed/);
    expect(tiles[2]!.name).not.toMatch(/upload/i);
    expect(tiles[2]!.name).toMatch(/^Photo taken .*filed under Roma, Italy.$/);
  });

  test('a day is a heading with its place, and the heading is not repeated per photograph', async () => {
    mockPhotos.data = [pending, failed, uploaded, OLDER];
    await render(<PhotosScreen />);
    const headings = accessibleNodes().filter((node) => node.role === 'header');
    expect(headings.map((node) => node.name)).toEqual([
      'Photos',
      'Tuesday, 12 May 2026, Roma',
      'Monday, 11 May 2026, Roma',
    ]);
  });

  test('no photographs: the words and the one way to add the first', async () => {
    await render(<PhotosScreen />);
    const nodes = accessibleNodes();
    expect(nodes.some((node) => node.id === 'photos-add')).toBe(true);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });
});
