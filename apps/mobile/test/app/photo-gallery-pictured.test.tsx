/**
 * The photo gallery as pictured (tasks.md T549; FR-044, FR-045; UI-SPEC 9.2; pictures
 * `more/photos*.png`; owner answer Q-11): the days, the mosaic's geometry on screen, the `+N`
 * tile, the upload summary line, the floating "Add photos", and the coming-soon controls.
 * The pure rules (grouping, cells, `+N`, the summary) are in `test/features/photo-*.test.ts`;
 * this suite pins that the screen draws them. Rendered like `photo-screen.test.tsx`: the live
 * hooks mocked through `photo-screen-harness.tsx`, everything else real.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import PhotosScreen from '@/app/trip/[id]/photos';
import type { PhotoWithPlace } from '@/db/repositories/photos';

import { resetKeyboard, showKeyboard } from '../helpers/keyboard';
import {
  failed,
  hidden,
  mockActions,
  mockCapture,
  mockPhotos,
  pending,
  photo,
  resetPhotoScreen,
  styleOf,
  uploaded,
} from './photo-screen-harness';

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
  require('./photo-screen-harness').tripsModule(),
);
jest.mock('@/features/photos/use-photos', () =>
  require('./photo-screen-harness').photosModule(),
);
jest.mock('@/features/photos/use-capture', () =>
  require('./photo-screen-harness').captureModule(),
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

const at = (id: string, day: string, overrides: Partial<PhotoWithPlace> = {}) =>
  photo(id, { taken_at: `${day}T12:00:00.000Z`, ...overrides });

/** `count` photographs of one day, newest first, each with its own id. */
const dayOf = (count: number, day: string, overrides: Partial<PhotoWithPlace> = {}) =>
  Array.from({ length: count }, (_, index) => {
    const id = `${String.fromCharCode(97 + (index % 26))}${index}${day.slice(-2)}`.padEnd(
      8,
      '0',
    );
    return at(id, day, overrides);
  });

const tileOf = (shown: PhotoWithPlace) => screen.getByTestId(`photo-tile-${shown.id}`);
const frameOf = (shown: PhotoWithPlace) => {
  const { left, top, width, height } = styleOf(tileOf(shown));
  return { left, top, width, height };
};

describe('<PhotosScreen> — the days (FR-045)', () => {
  test('groups by day, newest first, each with a big numeral, the place, the weekday and the count', async () => {
    mockPhotos.data = [
      ...dayOf(3, '2026-05-12', { city_name: 'Sintra' }),
      ...dayOf(2, '2026-05-11', { city_name: 'Lisboa' }),
    ];
    await render(<PhotosScreen />);

    const numerals = screen
      .getAllByTestId(/^day-numeral-/)
      .map((node) => node.props.children);
    expect(numerals).toEqual(['12', '11']);

    const first = screen.getByTestId('day-header-2026-05-12');
    expect(within(first).getByText('Sintra')).toBeTruthy();
    expect(within(first).getByText('Tue · May · 3 photos')).toBeTruthy();
    const second = screen.getByTestId('day-header-2026-05-11');
    expect(within(second).getByText('Lisboa')).toBeTruthy();
    expect(within(second).getByText('Mon · May · 2 photos')).toBeTruthy();
  });

  test('each day is one announced header named by its whole sentence', async () => {
    mockPhotos.data = dayOf(2, '2026-05-12', { city_name: 'Sintra' });
    await render(<PhotosScreen />);

    const header = screen.getByTestId('day-header-2026-05-12');
    expect(header.props.accessibilityRole).toBe('header');
    expect(header.props.accessibilityLabel).toMatch(/^Tuesday,? 12 May 2026, Sintra$/);
  });

  test('the photographs with no date are one group at the end, with no numeral', async () => {
    mockPhotos.data = [
      at('aaaaaaa1', '2026-05-12'),
      photo('bbbbbbb1', { taken_at: null }),
    ];
    await render(<PhotosScreen />);

    expect(screen.getByTestId('day-header-undated')).toBeTruthy();
    expect(screen.queryByTestId('day-numeral-undated')).toBeNull();
    expect(
      within(screen.getByTestId('day-header-undated')).getByText('Date unknown'),
    ).toBeTruthy();
  });

  test('the subtitle counts all the photographs, not the tiles shown', async () => {
    mockPhotos.data = dayOf(14, '2026-05-12');
    await render(<PhotosScreen />);
    expect(screen.getByTestId('photos-subtitle')).toHaveTextContent(/ · 14 photos$/);
  });
});

describe('<PhotosScreen> — the mosaic (photos.png: 114 dp tiles, gap 4)', () => {
  test('the first photograph is the large tile, two are stacked beside it, three across below', async () => {
    const six = dayOf(6, '2026-05-12');
    mockPhotos.data = six;
    await render(<PhotosScreen />);

    // 390 dp window less the two 20 dp margins: a 350 dp mosaic of 114 dp tiles.
    expect(frameOf(six[0])).toEqual({ left: 0, top: 0, width: 232, height: 232 });
    expect(frameOf(six[1])).toEqual({ left: 236, top: 0, width: 114, height: 114 });
    expect(frameOf(six[2])).toEqual({ left: 236, top: 118, width: 114, height: 114 });
    expect(frameOf(six[3])).toEqual({ left: 0, top: 236, width: 114, height: 114 });
    expect(frameOf(six[4])).toEqual({ left: 118, top: 236, width: 114, height: 114 });
    expect(frameOf(six[5])).toEqual({ left: 236, top: 236, width: 114, height: 114 });
  });

  test('the next day puts its large tile on the other side', async () => {
    const today = dayOf(3, '2026-05-12');
    const before = dayOf(3, '2026-05-11');
    mockPhotos.data = [...today, ...before];
    await render(<PhotosScreen />);

    expect(frameOf(today[0]).left).toBe(0);
    expect(frameOf(before[0]).left).toBe(118);
    expect(frameOf(before[1]).left).toBe(0);
  });

  test('three columns hold at the largest text size: a tile holds no text that has to fit', async () => {
    const six = dayOf(6, '2026-05-12');
    mockPhotos.data = six;
    phone(2);
    await render(<PhotosScreen />);

    expect(frameOf(six[0])).toEqual({ left: 0, top: 0, width: 232, height: 232 });
    expect(frameOf(six[5])).toEqual({ left: 236, top: 236, width: 114, height: 114 });
  });

  test('an uploaded photograph is drawn bare: no scrim, no disc, no pill over it', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    const frame = screen.getByTestId(`photo-frame-${uploaded.id}`);
    expect((frame as unknown as { children: unknown[] }).children).toHaveLength(1);
  });
});

describe('<PhotosScreen> — the +N tile', () => {
  test('a day of 14 shows six tiles and the sixth says +9 on a scrim over the whole tile', async () => {
    const fourteen = dayOf(14, '2026-05-12', { city_name: 'Sintra' });
    mockPhotos.data = fourteen;
    await render(<PhotosScreen />);

    expect(screen.getAllByTestId(/^photo-tile-/)).toHaveLength(6);
    const sixth = tileOf(fourteen[5]);
    expect(within(sixth).getByTestId('photo-more-count')).toHaveTextContent('+9');
    expect(screen.queryByTestId(`photo-tile-${fourteen[6].id}`)).toBeNull();
    expect(screen.getAllByTestId('photo-more-count')).toHaveLength(1);
    // The scrim covers the whole tile and takes no touch.
    const frame = within(sixth).getByTestId(`photo-frame-${fourteen[5].id}`);
    const scrim = (frame as unknown as { children: { props: Record<string, unknown> }[] })
      .children[1]!;
    expect(styleOf(scrim as never)).toMatchObject({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
    expect(scrim.props.pointerEvents).toBe('none');
  });

  test('its name says how many photographs from which day', async () => {
    const fourteen = dayOf(14, '2026-05-12', { city_name: 'Sintra' });
    mockPhotos.data = fourteen;
    await render(<PhotosScreen />);

    expect(
      screen.getByTestId(`photo-open-${fourteen[5].id}`).props.accessibilityLabel,
    ).toMatch(/^9 more photos from Tuesday,? 12 May 2026, Sintra$/);
  });

  test('pressing it shows the whole day, with no +N left', async () => {
    const fourteen = dayOf(14, '2026-05-12');
    mockPhotos.data = fourteen;
    await render(<PhotosScreen />);

    await fireEvent.press(screen.getByTestId(`photo-open-${fourteen[5].id}`));

    expect(screen.getAllByTestId(/^photo-tile-/)).toHaveLength(14);
    expect(screen.queryByTestId('photo-more-count')).toBeNull();
    // Opening the day is not opening a photograph.
    expect(screen.queryByTestId('photo-viewer')).toBeNull();
  });

  test('up to six photographs have no +N', async () => {
    mockPhotos.data = dayOf(6, '2026-05-12');
    await render(<PhotosScreen />);
    expect(screen.queryByTestId('photo-more-count')).toBeNull();
  });

  test('a photograph on an ordinary tile opens the viewer', async () => {
    const three = dayOf(3, '2026-05-12');
    mockPhotos.data = three;
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByTestId(`photo-open-${three[1].id}`));
    expect(screen.getByTestId('photo-viewer')).toBeTruthy();
  });
});

describe('<PhotosScreen> — the upload summary line (FR-045)', () => {
  test('says how many wait and how many failed, with Retry for the failed', async () => {
    mockPhotos.data = [pending, failed, uploaded];
    await render(<PhotosScreen />);

    const line = screen.getByTestId('photos-upload-summary');
    expect(within(line).getByText('1 waiting to upload')).toBeTruthy();
    expect(within(line).getByText('1 failed')).toBeTruthy();
    expect(within(line).getByLabelText('Retry failed upload')).toBeTruthy();
    expect(line.props.accessibilityLiveRegion).toBe('polite');
  });

  test('Retry puts every failed photograph back in the queue, and only those', async () => {
    const second = photo('ffffffff', { upload_state: 'failed' });
    mockPhotos.data = [pending, failed, second, uploaded];
    await render(<PhotosScreen />);

    await fireEvent.press(screen.getByLabelText('Retry failed uploads'));

    expect(mockActions.retryUpload.mock.calls.map(([id]) => id).sort()).toEqual(
      [failed.id, second.id].sort(),
    );
  });

  test('a retry that cannot be written is said, never swallowed', async () => {
    mockPhotos.data = [failed];
    mockActions.retryUpload.mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    await render(<PhotosScreen />);

    await fireEvent.press(screen.getByLabelText('Retry failed upload'));

    expect(screen.getByTestId('photos-write-error')).toHaveTextContent(
      'That change couldn’t be saved on this device. Please try again.',
    );
  });

  test('only what waits is said when nothing failed: no Retry', async () => {
    mockPhotos.data = [pending];
    await render(<PhotosScreen />);

    expect(screen.getByText('1 waiting to upload')).toBeTruthy();
    expect(screen.queryByText('1 failed')).toBeNull();
    expect(screen.queryByTestId('photos-retry-failed')).toBeNull();
  });

  test('never says "uploading N of M": the store has no progress to say it with', async () => {
    mockPhotos.data = [pending, failed, uploaded];
    await render(<PhotosScreen />);
    expect(screen.queryByText(/uploading|of \d/i)).toBeNull();
  });

  test('is not drawn when every photograph has arrived, while loading, or with none', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    expect(screen.queryByTestId('photos-upload-summary')).toBeNull();

    mockPhotos.data = [];
    await screen.rerender(<PhotosScreen />);
    expect(screen.queryByTestId('photos-upload-summary')).toBeNull();

    mockPhotos.data = [pending];
    mockPhotos.loading = true;
    await screen.rerender(<PhotosScreen />);
    expect(screen.queryByTestId('photos-upload-summary')).toBeNull();
  });
});

describe('<PhotosScreen> — the floating "Add photos" (FR-044)', () => {
  test('is the one add button, bottom end, named for the library, and opens it', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);

    const add = screen.getByTestId('photos-add');
    expect(add.props.accessibilityLabel).toBe('Add photos from your library');
    expect(within(add).getByText('Add photos')).toBeTruthy();
    expect(styleOf(add)).toMatchObject({ position: 'absolute', end: 20 });
    await fireEvent.press(add);
    expect(mockCapture.addFromLibrary).toHaveBeenCalledTimes(1);
  });

  test('goes with the keyboard', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);

    await showKeyboard();
    expect(screen.queryByTestId('photos-add', hidden)).toBeNull();
  });

  test('is there while loading and after a failed read: the traveller can still add', async () => {
    mockPhotos.loading = true;
    await render(<PhotosScreen />);
    expect(screen.getByTestId('photos-add')).toBeTruthy();

    mockPhotos.loading = false;
    mockPhotos.error = new Error('boom');
    await screen.rerender(<PhotosScreen />);
    expect(screen.getByTestId('photos-add')).toBeTruthy();
  });

  test('the list leaves room under its last photograph for it', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    const content = screen.getByTestId('photos-list').props.contentContainerStyle;
    expect(content.paddingBottom).toBeGreaterThanOrEqual(52 + 16 + 16);
  });
});

describe('<PhotosScreen> — the pictured controls without a capability (Q-11)', () => {
  test('select-all and more are drawn in the bar as coming-soon buttons, named from the picture', async () => {
    await render(<PhotosScreen />);

    for (const [id, name] of [
      ['coming-soon-photos-select', 'Select photos'],
      ['coming-soon-photos-more', 'More'],
    ] as const) {
      const control = screen.getByTestId(id);
      expect(control.props.accessibilityLabel).toBe(name);
      expect(control.props.accessibilityHint).toBe('Not available yet');
      expect(control.props.accessibilityRole).toBe('button');
    }
  });

  test('the camera is the app’s own control beside them, with its own name and id', async () => {
    await render(<PhotosScreen />);
    const take = screen.getByTestId('photos-take');
    expect(take.props.accessibilityLabel).toBe('Take a photo with the camera');
    await fireEvent.press(take);
    expect(mockCapture.takePhoto).toHaveBeenCalledTimes(1);
  });

  test('Photos is private by default and says so, without a lock chip in the bar', async () => {
    await render(<PhotosScreen />);
    expect(screen.getByText('Private — only you can see your photos.')).toBeTruthy();
    expect(screen.queryByTestId('privacy-chip')).toBeNull();
  });
});
