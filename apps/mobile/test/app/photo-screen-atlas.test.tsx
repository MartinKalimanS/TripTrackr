/**
 * The photo gallery on Atlas — what the restyle promises (tasks.md T442; 004 FR-005,
 * FR-015, FR-019, FR-024 to FR-026, FR-029, FR-030, FR-033, FR-034, FR-036, FR-037;
 * contract C4-10 rules 3, 6 and 9).
 *
 * `photo-screen.test.tsx` pins what the gallery DOES (states, capture, the photo view);
 * this suite pins how it is built and looks, rendered the same way (the live hooks mocked
 * through `photo-screen-harness.tsx`, everything else real):
 *   - one primary control per state (FR-005);
 *   - a photo not yet uploaded is marked by an icon and a word on its tile (the pictured
 *     disc and "Retry" pill, T549 FR-045), never hue alone, and the retry of a failed one
 *     is a control of its own;
 *   - a photograph that is safe is drawn bare: no tint, scrim or shadow over its thumbnail,
 *     a hairline boundary round every one, and a ring outside the tile for focus and press
 *     (FR-033, 002 C12; the failed tile's and the +N tile's scrims are the pictured ones);
 *   - the photo view's emphasis, chips and notes;
 *   - the sources import no retired primitive, no kit and no colour literal (FR-036).
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { StyleSheet } from 'react-native';

import PhotosScreen from '@/app/trip/[id]/photos';
import type { PhotoWithPlace } from '@/db/repositories/photos';

import {
  failed,
  hidden,
  hostAncestors,
  buttonsOf,
  mockCapture,
  mockPhotos,
  pending,
  photo,
  resetPhotoScreen,
  styleOf,
  uploaded,
  variantOf,
} from './photo-screen-harness';
import { anyGlyph, glyphId } from '../helpers/icons';

// The screen asks the router for its params only: the title and Back belong to the
// navigator (`trip/[id]/_layout.tsx`), so a screen that reached for `useRouter` would fail.
const mockParams: { id: string | string[] | undefined } = { id: 'trip-42' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
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

// A View that carries every prop, so a test reads `source` and fires `onError`.
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

beforeEach(() => {
  mockParams.id = 'trip-42';
  resetPhotoScreen();
});

describe('<PhotosScreen> — one primary control per state (FR-005)', () => {
  test('"Add photos" is the one primary, "Take a photo" a tonal icon button in the bar', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);

    expect(variantOf(screen.getByTestId('photos-add'))).toBe('primary');
    const take = screen.getByTestId('photos-take');
    expect(take.props.accessibilityLabel).toBe('Take a photo with the camera');
    expect(take.props.accessibilityRole).toBe('button');
    expect(buttonsOf('primary')).toHaveLength(1);
  });

  test('with no photographs the empty state carries the one primary and the floating button is gone', async () => {
    await render(<PhotosScreen />);

    expect(screen.getAllByTestId('photos-add')).toHaveLength(1);
    expect(variantOf(screen.getByTestId('photos-add'))).toBe('primary');
    expect(buttonsOf('primary')).toHaveLength(1);
  });

  test('loading, an error and a full gallery each show exactly one primary', async () => {
    mockPhotos.loading = true;
    await render(<PhotosScreen />);
    expect(buttonsOf('primary')).toHaveLength(1);

    mockPhotos.loading = false;
    mockPhotos.error = new Error('boom');
    await screen.rerender(<PhotosScreen />);
    expect(buttonsOf('primary')).toHaveLength(1);

    mockPhotos.error = null;
    mockPhotos.data = [pending, failed, uploaded];
    await screen.rerender(<PhotosScreen />);
    expect(buttonsOf('primary')).toHaveLength(1);
  });

  test('a capture notice adds only secondary and text controls', async () => {
    mockCapture.message = {
      tone: 'error',
      text: 'Camera access is turned off for TripTrackr. You can turn it on in Settings.',
      openSettings: true,
    };
    await render(<PhotosScreen />);

    expect(buttonsOf('primary')).toHaveLength(1);
    expect(variantOf(screen.getByLabelText('Open Settings'))).toBe('secondary');
    expect(variantOf(screen.getByLabelText('Dismiss this message'))).toBe('text');
  });
});

describe('<PhotosScreen> — a photo not yet uploaded is marked by an icon and a word, never hue alone (FR-025, FR-034, FR-045)', () => {
  const tile = (shown: PhotoWithPlace) => screen.getByTestId(`photo-tile-${shown.id}`);
  const glyph = (node: Parameters<typeof within>[0]) =>
    within(node).getByTestId(anyGlyph, hidden).props.testID as string;

  test('a photo waiting to upload wears the dashed cloud disc, hidden from a screen reader that has the tile’s name', async () => {
    mockPhotos.data = [pending];
    await render(<PhotosScreen />);

    const icon = within(tile(pending)).getByTestId('photo-status-icon', hidden);
    expect(icon.props.accessible).toBe(false);
    expect(glyph(tile(pending))).toBe(glyphId('cloud-upload', 'regular'));
    const disc = hostAncestors(icon)[0]!;
    expect(styleOf(disc)).toMatchObject({
      width: 28,
      height: 28,
      outlineStyle: 'dashed',
    });
    expect(disc.props.accessibilityElementsHidden).toBe(true);
    expect(
      screen.getByTestId(`photo-open-${pending.id}`).props.accessibilityLabel,
    ).toMatch(/Waiting to upload — saved on this device only\.$/);
  });

  test('a failed photo says so in a glyph and the word "Retry", on a scrim, and its name says "Upload failed"', async () => {
    mockPhotos.data = [failed];
    await render(<PhotosScreen />);

    const retry = within(tile(failed)).getByLabelText('Try uploading this photo again');
    expect(retry.props.accessibilityRole).toBe('button');
    expect(within(retry).getByText('Retry')).toBeTruthy();
    expect(within(retry).getByTestId('photo-status-icon', hidden)).toBeTruthy();
    expect(glyph(retry)).toBe(glyphId('alert', 'regular'));
    expect(
      screen.getByTestId(`photo-open-${failed.id}`).props.accessibilityLabel,
    ).toMatch(/Upload failed\.$/);
    // The pictured scrim lies over the whole failed tile (`.pt.fail::after`).
    const frame = screen.getByTestId(`photo-frame-${failed.id}`);
    expect((frame as unknown as { children: unknown[] }).children).toHaveLength(2);
  });

  test('each state has a different glyph', async () => {
    mockPhotos.data = [pending, failed];
    await render(<PhotosScreen />);
    expect(glyph(tile(pending))).not.toBe(glyph(tile(failed)));
  });

  test('the retry for a failed upload is its own control beside the tile’s button, not nested in it', async () => {
    mockPhotos.data = [failed];
    await render(<PhotosScreen />);

    const retry = screen.getByLabelText('Try uploading this photo again');
    const above = hostAncestors(retry).map((ancestor) => ancestor.props.testID);
    expect(above).not.toContain(`photo-open-${failed.id}`);
    expect(above).toContain(`photo-tile-${failed.id}`);
    expect(styleOf(retry).minHeight).toBeGreaterThanOrEqual(32);
    expect(retry.props.hitSlop).toMatchObject({ top: 6, bottom: 6 });
  });

  test('the word "Retry" on a tile stops growing at 1.3 times the text size', async () => {
    mockPhotos.data = [failed];
    await render(<PhotosScreen />);
    expect(within(tile(failed)).getByText('Retry').props.maxFontSizeMultiplier).toBe(1.3);
  });

  test('an uploaded photograph carries nothing: a tile with no mark is a safe one', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    expect(within(tile(uploaded)).queryByTestId(anyGlyph, hidden)).toBeNull();
  });

  test('a photograph uploaded from this device a moment ago wears the tick', async () => {
    const fresh = photo('eeeeeeee', { synced_at: new Date().toISOString() });
    mockPhotos.data = [fresh];
    await render(<PhotosScreen />);
    expect(within(tile(fresh)).getByTestId('photo-synced-icon', hidden)).toBeTruthy();
    expect(within(tile(fresh)).queryByTestId('photo-status-icon', hidden)).toBeNull();
  });
});

describe('<PhotosScreen> — nothing is laid across a photograph (FR-033, 002 C12)', () => {
  const FORBIDDEN = /shadow|opacity|blur|backdrop|overlay|scrim|tint/i;

  test('no ancestor of a thumbnail casts a shadow or fades it, and no sibling covers it', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    const image = screen.getByTestId(`photo-thumbnail-${uploaded.id}`);

    for (const ancestor of hostAncestors(image)) {
      const style = styleOf(ancestor);
      expect(style.boxShadow).toBeUndefined();
      expect(style.shadowColor).toBeUndefined();
      expect(style.shadowOpacity).toBeUndefined();
      expect(style.elevation).toBeUndefined();
      // (`FlashList` cells carry an explicit full opacity: nothing fades.)
      expect([undefined, 1]).toContain(style.opacity);
      expect(String(ancestor.props.className ?? '')).not.toMatch(FORBIDDEN);
    }
    // The frame holds the picture and nothing else: no scrim, badge or glyph over it.
    const frame = screen.getByTestId(`photo-frame-${uploaded.id}`);
    expect((frame as unknown as { children: unknown[] }).children).toHaveLength(1);
  });

  test('the picture itself is drawn at full fidelity: no tint, no blur, no fade-in veil', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    const image = screen.getByTestId(`photo-thumbnail-${uploaded.id}`);

    expect(image.props.tintColor).toBeUndefined();
    expect(image.props.blurRadius).toBeUndefined();
    expect(image.props.transition).toBe(0);
    expect(styleOf(image).opacity).toBeUndefined();
    expect(styleOf(image).tintColor).toBeUndefined();
    expect(String(image.props.className ?? '')).not.toMatch(FORBIDDEN);
  });

  test('every photograph keeps a hairline boundary, whatever its tone, and the frame paints no fill', async () => {
    mockPhotos.data = [uploaded, pending];
    await render(<PhotosScreen />);

    for (const shown of [uploaded, pending]) {
      const frame = styleOf(screen.getByTestId(`photo-frame-${shown.id}`));
      expect(frame.borderWidth).toBe(StyleSheet.hairlineWidth);
      expect(frame.borderColor).toBeTruthy();
      expect(frame.backgroundColor).toBeUndefined();
      expect(frame.boxShadow).toBeUndefined();
      expect(frame.overflow).toBe('hidden');
    }
  });

  test('the photo view frames its full image the same way', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByTestId(`photo-open-${uploaded.id}`));
    const viewer = screen.getByTestId('photo-viewer');
    const image = within(viewer).getByTestId('photo-viewer-image');

    const frame = hostAncestors(image)[0]!;
    expect(styleOf(frame).borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(styleOf(frame).backgroundColor).toBeUndefined();
    for (const ancestor of hostAncestors(image)) {
      expect(styleOf(ancestor).boxShadow).toBeUndefined();
      expect(styleOf(ancestor).opacity).toBeUndefined();
    }
  });
});

describe('<PhotosScreen> — a tile is one control (FR-026, FR-030)', () => {
  test('keeps its role, name and hint, and a ring outside the tile, never a fill, while it has focus', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    const open = screen.getByTestId(`photo-open-${uploaded.id}`);

    expect(open.props.accessibilityRole).toBe('button');
    expect(open.props.accessibilityHint).toBe('Opens the photo');
    expect(styleOf(open).outlineWidth).toBeUndefined();

    await fireEvent(open, 'focus');
    expect(styleOf(open).outlineWidth).toBeGreaterThan(0);
    expect(styleOf(open).outlineOffset).toBeGreaterThan(0);
    expect(styleOf(open).backgroundColor).toBeUndefined();
    await fireEvent(open, 'blur');
    expect(styleOf(open).outlineWidth).toBeUndefined();
  });

  test('is far above the platform’s touch target: 114 dp square, at every text size', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    const frame = styleOf(screen.getByTestId(`photo-tile-${uploaded.id}`));

    expect(frame.width).toBeGreaterThanOrEqual(44);
    expect(frame.height).toBeGreaterThanOrEqual(44);
  });

  test('the grid is the list: a FlashList scroller under the screen’s own header', async () => {
    mockPhotos.data = [uploaded];
    await render(<PhotosScreen />);
    const list = screen.getByTestId('photos-list');

    expect(list.type).toBe('RCTScrollView');
    // No native header on this route: nothing for the list to inset itself below.
    expect(list.props.contentInsetAdjustmentBehavior).toBeUndefined();
    expect(within(list).getByTestId(`photo-tile-${uploaded.id}`)).toBeTruthy();
  });
});

describe('<PhotosScreen> — the photo view on Atlas (FR-005, FR-024, FR-025, FR-026, FR-029)', () => {
  async function openPhoto(shown: PhotoWithPlace) {
    mockPhotos.data = [shown];
    await render(<PhotosScreen />);
    await fireEvent.press(screen.getByTestId(`photo-open-${shown.id}`));
    return screen.getByTestId('photo-viewer');
  }

  test('Close is a secondary button with its words and an icon; the way out is never colour alone', async () => {
    const viewer = await openPhoto(uploaded);
    const close = within(viewer).getByLabelText('Close photo');

    expect(close.props.accessibilityRole).toBe('button');
    expect(variantOf(close)).toBe('secondary');
    expect(within(close).getByText('Close')).toBeTruthy();
    expect(within(close).getByTestId(glyphId('x'), hidden)).toBeTruthy();
  });

  test('Delete is the one destructive control, in words and with an icon, and no control is primary', async () => {
    const viewer = await openPhoto(failed);
    const remove = within(viewer).getByLabelText('Delete this photo');

    expect(variantOf(remove)).toBe('destructive');
    expect(within(remove).getByText('Delete')).toBeTruthy();
    expect(within(remove).getByTestId(glyphId('trash'), hidden)).toBeTruthy();
    // Close and the retry are secondary: nothing in the view competes for primary.
    const inViewer = within(viewer).getAllByRole('button', hidden);
    expect(inViewer.filter((button) => variantOf(button) === 'primary')).toHaveLength(0);
    expect(inViewer.filter((button) => variantOf(button) === 'destructive')).toHaveLength(
      1,
    );
  });

  test('the retry beside a failed photo’s status is a secondary button', async () => {
    const viewer = await openPhoto(failed);
    const retry = within(viewer).getByLabelText('Try uploading this photo again');
    expect(variantOf(retry)).toBe('secondary');
    expect(within(retry).getByText('Try again')).toBeTruthy();
  });

  test('filing is a radio group of chips: one selected, announced selected and checked, by more than colour', async () => {
    const viewer = await openPhoto(uploaded);

    const roma = within(viewer).getByTestId('photo-file-city:100');
    expect(
      hostAncestors(roma).some(
        (ancestor) => ancestor.props.accessibilityRole === 'radiogroup',
      ),
    ).toBe(true);
    const firenze = within(viewer).getByTestId('photo-file-city:101');
    expect(roma.props.accessibilityRole).toBe('radio');
    expect(roma.props.accessibilityState).toMatchObject({
      selected: true,
      checked: true,
    });
    expect(firenze.props.accessibilityState).toMatchObject({
      selected: false,
      checked: false,
    });
    // The selected chip is the filled one (ink), with a check glyph in place of nothing.
    expect(within(roma).getByTestId('photo-file-city:100-check', hidden)).toBeTruthy();
    expect(within(firenze).queryByTestId('photo-file-city:101-check', hidden)).toBeNull();
    // Names are as they were.
    expect(roma.props.accessibilityLabel).toBe('File under Roma, Italy');
    expect(within(viewer).getByTestId('photo-file-none').props.accessibilityLabel).toBe(
      'File under no city',
    );
  });

  test('the notes in the view read as text: no fixed heights, nothing capped (FR-029)', async () => {
    const viewer = await openPhoto(pending);
    for (const words of [
      'Saved on this device only. It uploads when you’re online.',
      'Private — only you can see your photos.',
    ]) {
      const node = within(viewer).getByText(words);
      expect(node.props.numberOfLines).toBeUndefined();
      expect(node.props.maxFontSizeMultiplier).toBeUndefined();
    }
  });

  test('the status badge and its explanation are both there: words, an icon and a dashed edge', async () => {
    const viewer = await openPhoto(pending);
    const badge = within(viewer).getByLabelText('Waiting to upload');

    expect(String(badge.props.className)).toContain('border-dashed');
    expect(within(badge).getByTestId('photo-status-icon', hidden)).toBeTruthy();
  });

  test('is a full-screen modal over the grid with the explicit Close', async () => {
    await openPhoto(uploaded);
    const modal = screen.getByTestId('photo-viewer-modal');
    expect(modal.props.presentationStyle).toBe('fullScreen');
    expect(modal.props.visible).toBe(true);
    expect(within(modal).getByLabelText('Close photo')).toBeTruthy();
  });
});

describe('<PhotosScreen> — sources (FR-036)', () => {
  const FILES = [
    'app/trip/[id]/photos.tsx',
    'components/trip/photo-tile.tsx',
    'components/trip/photo-viewer.tsx',
    'components/trip/photos-header.tsx',
    'components/trip/photo-status.tsx',
    'components/trip/photo-mosaic.tsx',
    'components/trip/day-header.tsx',
    'components/trip/upload-summary-pill.tsx',
    'components/trip/photos-skeleton.tsx',
    'components/ui/area-header.tsx',
    'components/ui/area-fab.tsx',
  ];
  const source = (file: string) =>
    readFileSync(path.resolve(__dirname, '..', '..', 'src', file), 'utf8');
  const importsOf = (text: string) =>
    [...text.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

  test.each(FILES)('%s imports none of the retired primitives', (file) => {
    const specifiers = importsOf(source(file));
    for (const retired of [
      '@/components/ui/surface',
      '@/components/ui/pressable-surface',
      '@/components/ui/pill-group',
      '@/components/ui/text-field',
      '@/components/themed-text',
    ]) {
      expect(specifiers).not.toContain(retired);
    }
  });

  test.each(FILES)('%s has no colour literal and imports no kit', (file) => {
    const text = source(file);
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|\[#/);
    expect(importsOf(text).some((from) => /^(heroui-native|uniwind)/.test(from))).toBe(
      false,
    );
  });

  test('the grid is a ListScreen (FlashList) under the header, never a Screen with rows nested in it', () => {
    const text = source('app/trip/[id]/photos.tsx');
    expect(importsOf(text)).toContain('@/components/ui/list-screen');
    expect(importsOf(text)).not.toContain('@/components/ui/screen');
    expect(text).toContain("edges={['bottom']}");
  });
});

/**
 * Edges the states above do not reach: the route parameter's shapes, the
 * notice's own controls, a full image that will not draw, an unfiled photo,
 * and the ring that says which tile has focus.
 */
