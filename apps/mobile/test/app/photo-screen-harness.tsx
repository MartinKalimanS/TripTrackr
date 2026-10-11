/**
 * Shared fixtures and helpers of the photo screen suites (tasks.md T117, T442):
 * `photo-screen.test.tsx` (states, grid, capture, the photo view) and
 * `photo-screen-atlas.test.tsx` (what the Atlas restyle promises: emphasis, boundaries,
 * nothing across a photograph, sources).
 *
 * The live hooks, the capture hook and the actions are replaced by the plain objects below,
 * which a test mutates; each suite installs them with, for example,
 *
 *   jest.mock('@/features/photos/use-photos', () =>
 *     require('./photo-screen-harness').photosModule());
 *
 * (`jest.mock` is hoisted above imports, so a factory can only reach this file through
 * `require`). `resetPhotoScreen()` puts them back before each test.
 */
import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { PhotoWithPlace } from '@/db/repositories/photos';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import type { CaptureMessage } from '@/features/photos/capture';

export const TRIP = '5e0c1d2a-3b4c-4d5e-8f90-a1b2c3d4e5f6';

export const trip: TripRow = {
  id: 'trip-42',
  title: 'Italy, spring 2026',
  home_currency: 'EUR',
  is_public: false,
  cover_photo_id: null,
  status: 'planning',
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-01T10:00:00.000Z',
  deleted_at: null,
  is_dirty: false,
  synced_at: '2026-04-01T10:00:00.000Z',
};

export const stop = (overrides: Partial<StopWithPlace>): StopWithPlace => ({
  id: 'stop-rome',
  trip_id: 'trip-42',
  city_id: 100,
  sort_order: 0,
  arrive_date: '2026-05-10',
  depart_date: '2026-05-12',
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: false,
  synced_at: 'x',
  city_name: 'Roma',
  country_id: 1,
  country_name: 'Italy',
  lat: 41.9028,
  lng: 12.4964,
  ...overrides,
});

export const mockTrip = { data: trip as TripRow | null, loading: false, error: null };
export const mockStops = {
  data: [
    stop({}),
    stop({
      id: 'stop-florence',
      city_id: 101,
      city_name: 'Firenze',
      lat: 43.7696,
      lng: 11.2558,
    }),
  ],
  loading: false,
  error: null,
};

export const mockPhotos = {
  data: [] as PhotoWithPlace[],
  loading: false,
  error: null as Error | null,
};
export const mockActions = {
  refile: jest.fn(),
  remove: jest.fn(),
  retryUpload: jest.fn(),
};
export const mockUploads = jest.fn();
export const mockUsePhotos = jest.fn(() => mockPhotos);

export const mockCapture = {
  busy: false,
  message: null as CaptureMessage | null,
  clearMessage: jest.fn(),
  addFromLibrary: jest.fn(async () => undefined),
  takePhoto: jest.fn(async () => undefined),
};

export function photo(
  id: string,
  overrides: Partial<PhotoWithPlace> = {},
): PhotoWithPlace {
  const photoId = `${id.padEnd(8, '0').slice(0, 8)}-1111-4111-8111-111111111111`;
  return {
    id: photoId,
    trip_id: 'trip-42',
    city_id: 100,
    taken_at: '2026-05-12T16:30:05.000Z',
    exif_lat: 41.8986,
    exif_lng: 12.4769,
    is_public: false,
    upload_state: 'uploaded',
    moderation_state: 'pending',
    has_thumbnail: false,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
    deleted_at: null,
    is_dirty: false,
    synced_at: '2026-06-01T10:00:00.000Z',
    local_file_uri: `photos/${TRIP}/${photoId}.jpg`,
    city_name: 'Roma',
    country_name: 'Italy',
    city_lat: 41.9028,
    city_lng: 12.4964,
    city_timezone: 'Europe/Rome',
    ...overrides,
  };
}

export const pending = photo('aaaaaaaa', {
  upload_state: 'pending',
  is_dirty: true,
  synced_at: null,
});
export const failed = photo('bbbbbbbb', {
  upload_state: 'failed',
  is_dirty: true,
  synced_at: null,
});
export const uploaded = photo('cccccccc');

/** The module shapes the suites hand to `jest.mock`. */
export const tripsModule = () => ({
  useTrip: () => mockTrip,
  useTripStops: () => mockStops,
});
export const photosModule = () => ({
  usePhotos: () => mockUsePhotos(),
  usePhotoActions: () => mockActions,
  usePhotoUploads: (tripId: string) => mockUploads(tripId),
});
export const captureModule = () => ({ useCapture: () => mockCapture });

/** Every mutable fixture back to its starting state; the route param is the suite's own. */
export function resetPhotoScreen() {
  mockTrip.data = trip;
  mockPhotos.data = [];
  mockPhotos.loading = false;
  mockPhotos.error = null;
  mockCapture.busy = false;
  mockCapture.message = null;
  mockActions.refile.mockReset();
  mockActions.remove.mockReset();
  mockActions.retryUpload.mockReset();
  mockUsePhotos.mockClear();
}

export const hidden = { includeHiddenElements: true };

/**
 * The kit-button stand-in forwards the kit's own `variant`, so emphasis (FR-005) can be
 * counted: the adapter's `text` is the kit's `ghost` and its `destructive` the kit's `danger-soft`.
 */
export const KIT_VARIANT = {
  primary: 'primary',
  secondary: 'secondary',
  text: 'ghost',
  destructive: 'danger-soft',
} as const;
export const buttonsOf = (variant: keyof typeof KIT_VARIANT) =>
  screen
    .getAllByRole('button', hidden)
    .filter((button) => button.props.variant === KIT_VARIANT[variant]);
export const variantOf = (button: { props: Record<string, unknown> }) =>
  Object.entries(KIT_VARIANT).find(([, kit]) => kit === button.props.variant)?.[0];

/** Every ancestor of `node` that is a host view, nearest first. */
export function hostAncestors(node: { parent: unknown }) {
  const found: { type: unknown; props: Record<string, unknown> }[] = [];
  let up = (node as { parent: (typeof found)[number] | null }).parent;
  while (up) {
    if (typeof up.type === 'string') found.push(up);
    up = (up as unknown as { parent: typeof up | null }).parent;
  }
  return found;
}

export const styleOf = (node: { props: Record<string, unknown> }) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

type Rendered = string | { props: Record<string, unknown>; children?: Rendered[] | null };

/** The ids and words of the rendered tree in the order they are read, top to bottom. */
export function readingOrder(): string[] {
  const walk = (node: Rendered): string[] => {
    if (typeof node === 'string') return [node];
    const own = [node.props.testID, node.props.accessibilityLabel].filter(
      (value): value is string => typeof value === 'string',
    );
    return [...own, ...(node.children ?? []).flatMap(walk)];
  };
  return walk(screen.toJSON() as Rendered);
}
