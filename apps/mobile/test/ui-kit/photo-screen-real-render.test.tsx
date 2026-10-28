/**
 * 004 T442 - the photo gallery over the REAL `heroui-native` under Jest (research D4-13).
 *
 * `test/app/photo-screen*.test.tsx` render the screen over the stand-in. This file puts the
 * kit's own Button, Chip and Skeleton underneath it, so what the gallery relies on is
 * checked against the real components: nothing throws (a kit component needs only the
 * provider; a surface inside a surface is a development error), the ids and names land on
 * the nodes a test or a Maestro flow finds them by, the pressed and busy states are what
 * the adapters promise, and our classes reach the badge. How a class LOOKS (the dashed
 * edge, the soft fill, the shimmer) is Uniwind's, on a device.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';

import PhotosScreen from '@/app/trip/[id]/photos';

import {
  failed,
  mockCapture,
  mockPhotos,
  pending,
  resetPhotoScreen,
  uploaded,
} from '../app/photo-screen-harness';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
// The suite-wide stand-in is replaced by the real kit for THIS file only.
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));

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
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
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

const { HeroUINativeProvider } = jest.requireActual<typeof HeroUI>('heroui-native');
const CONFIG = { devInfo: { stylingPrinciples: false } };

// Under Jest the kit's `useThemeColor` asks Uniwind for `--color-*` variables the stylesheet
// transform never registered, so the kit's ghost Button (our `text` variant) cannot blend
// its hover colour and its colour kit reports it. That is the test environment, not the
// screen: only that message is dropped, every other error still prints.
const COLOUR_KIT_NOISE = /\[colorKit\.RGB\]/;
// The skeleton's shimmer gradient asks for the same colours and warns in the same way.
const SHIMMER_NOISE = /"invalid" is not a valid color/;
const consoleError = console.error.bind(console);
const consoleWarn = console.warn.bind(console);
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (!COLOUR_KIT_NOISE.test(String(args[0]))) consoleError(...args);
  });
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (!SHIMMER_NOISE.test(String(args[0]))) consoleWarn(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

function renderScreen() {
  return render(
    <HeroUINativeProvider config={CONFIG}>
      <PhotosScreen />
    </HeroUINativeProvider>,
  );
}

beforeEach(resetPhotoScreen);

describe('the photo gallery over the real kit', () => {
  test('renders the header, the grid and the marks on a not-yet-uploaded photo without error', async () => {
    mockPhotos.data = [pending, failed, uploaded];
    await renderScreen();

    expect(screen.getByTestId('photos-title')).toHaveTextContent('Photos');
    expect(screen.getByTestId('photos-subtitle')).toHaveTextContent(
      'Italy, spring 2026 · 3 photos',
    );
    expect(screen.getByTestId(`photo-thumbnail-${uploaded.id}`)).toBeTruthy();
    expect(
      within(screen.getByTestId(`photo-tile-${pending.id}`)).getByTestId(
        'photo-status-icon',
        { includeHiddenElements: true },
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId(`photo-tile-${failed.id}`)).getByText('Retry'),
    ).toBeTruthy();
    expect(screen.getByTestId('photos-upload-summary')).toBeTruthy();
  });

  test('"Add photos" is a button the kit names and presses, busy while a capture runs', async () => {
    await renderScreen();
    const add = screen.getByTestId('photos-add');

    expect(add.props.accessibilityRole).toBe('button');
    expect(add.props.accessibilityLabel).toBe('Add photos from your library');
    await fireEvent.press(add);
    expect(mockCapture.addFromLibrary).toHaveBeenCalled();

    mockCapture.busy = true;
    await screen.rerender(
      <HeroUINativeProvider config={CONFIG}>
        <PhotosScreen />
      </HeroUINativeProvider>,
    );
    expect(screen.getByTestId('photos-add').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  test('loading is one announced progressbar of skeleton tiles', async () => {
    mockPhotos.loading = true;
    await renderScreen();

    const region = screen.getByLabelText('Loading photos');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  test('an error offers the kit’s "Try again"', async () => {
    mockPhotos.error = new Error('boom');
    await renderScreen();

    const again = screen.getByLabelText('Try again');
    expect(again.props.accessibilityRole).toBe('button');
  });

  test('the photo view’s Close, Delete and filing chips are the kit’s, named as before', async () => {
    mockPhotos.data = [uploaded];
    await renderScreen();
    await fireEvent.press(screen.getByTestId(`photo-open-${uploaded.id}`));
    const viewer = screen.getByTestId('photo-viewer');

    expect(within(viewer).getByLabelText('Close photo').props.accessibilityRole).toBe(
      'button',
    );
    expect(
      within(viewer).getByLabelText('Delete this photo').props.accessibilityRole,
    ).toBe('button');
    const roma = within(viewer).getByTestId('photo-file-city:100');
    expect(roma.props.accessibilityRole).toBe('radio');
    expect(roma.props.accessibilityState).toMatchObject({
      selected: true,
      checked: true,
    });
  });
});
