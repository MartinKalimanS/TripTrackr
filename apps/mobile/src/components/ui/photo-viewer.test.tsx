/**
 * The photo viewer's zoom adapter (feature 005, T549; contract C5-26; research D5-13): the
 * gestures it asks of the toolkit (pinch and double-tap zoom, pan, swipe between, pull down to
 * close), its progressive loading (thumbnail first, then the full image, with an honest error)
 * and the fence around the toolkit (only this folder imports it). Jest runs the stand-in of
 * `test/mocks/react-native-zoom-toolkit.tsx`; the gestures themselves are device check T511.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { Dimensions, StyleSheet, Text as NativeText } from 'react-native';

import {
  ESTIMATE_HEIGHT_SHARE,
  FADE_IN_MS,
  GALLERY_WINDOW,
  MAX_ZOOM,
  PULL_CLOSE_DISTANCE,
  PULL_CLOSE_VELOCITY,
  PhotoGallery,
  ProgressivePhoto,
  fitWithin,
  pullClosesViewer,
  type ProgressivePhotoProps,
} from './photo-viewer';

jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});

const zoomHooks = jest.requireMock('react-native-zoom-toolkit') as {
  __gallery: () => { props: Record<string, any>; ref: { setIndex: jest.Mock } | null };
};
const gallery = () => zoomHooks.__gallery();
const hidden = { includeHiddenElements: true };

const ROOM = { width: 300, height: 400 };
const photos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

function layOut(size = ROOM) {
  fireEvent(screen.getByTestId('photo-viewer-gallery'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, ...size } },
  });
}

async function renderGallery(
  props: Partial<React.ComponentProps<typeof PhotoGallery<{ id: string }>>> = {},
) {
  const onIndexChange = jest.fn();
  const onPullDown = jest.fn();
  const view = await render(
    <PhotoGallery
      data={photos}
      index={0}
      keyOf={(photo) => photo.id}
      renderPhoto={(photo, size) => (
        <NativeText
          testID={`photo-${photo.id}`}>{`${photo.id} ${size.width}x${size.height}`}</NativeText>
      )}
      onIndexChange={onIndexChange}
      onPullDown={onPullDown}
      {...props}
    />,
  );
  await act(async () => layOut());
  return { onIndexChange, onPullDown, view };
}

describe('pullClosesViewer', () => {
  test.each([
    [{ translateY: PULL_CLOSE_DISTANCE, released: true, velocityY: 0 }, true],
    [{ translateY: PULL_CLOSE_DISTANCE - 1, released: true, velocityY: 0 }, false],
    [{ translateY: 10, released: true, velocityY: PULL_CLOSE_VELOCITY }, true],
    [{ translateY: 10, released: true, velocityY: PULL_CLOSE_VELOCITY - 1 }, false],
    [{ translateY: 500, released: false, velocityY: 5000 }, false],
    [{ translateY: -200, released: true, velocityY: -3000 }, false],
  ])('%j -> %s', (pull, closes) => {
    expect(pullClosesViewer(pull)).toBe(closes);
  });
});

describe('fitWithin', () => {
  test('fits a landscape and a portrait photo inside the room, keeping its proportions', () => {
    expect(fitWithin(ROOM, { width: 4000, height: 2000 })).toEqual({
      width: 300,
      height: 150,
    });
    expect(fitWithin(ROOM, { width: 1000, height: 4000 })).toEqual({
      width: 100,
      height: 400,
    });
  });

  test('is the room itself until the size is known, or when either is empty', () => {
    expect(fitWithin(ROOM, null)).toEqual(ROOM);
    expect(fitWithin(ROOM, { width: 0, height: 10 })).toEqual(ROOM);
    const empty = { width: 0, height: 0 };
    expect(fitWithin(empty, { width: 10, height: 10 })).toEqual(empty);
  });
});

describe('<PhotoGallery> - zoom, swipe and pull through the toolkit', () => {
  test('draws each photo at once, at an estimate of the card, then in the measured size', async () => {
    const onIndexChange = jest.fn();
    await render(
      <PhotoGallery
        data={photos}
        index={0}
        keyOf={(p) => p.id}
        renderPhoto={(p, size) => (
          <NativeText
            testID={`photo-${p.id}`}>{`${p.id} ${size.width}x${size.height}`}</NativeText>
        )}
        onIndexChange={onIndexChange}
        onPullDown={jest.fn()}
      />,
    );
    const { width, height } = Dimensions.get('window');
    expect(screen.getByTestId('photo-a')).toHaveTextContent(
      `a ${width}x${Math.round(height * ESTIMATE_HEIGHT_SHARE)}`,
    );

    await act(async () => layOut());
    expect(screen.getByTestId('photo-a')).toHaveTextContent('a 300x400');
  });

  test('asks the toolkit for pinch and double-tap zoom up to the cap, three photos mounted', async () => {
    await renderGallery();
    const { props } = gallery();

    expect(props.maxScale).toBe(MAX_ZOOM);
    expect(props.windowSize).toBe(GALLERY_WINDOW);
    expect(props.tapOnEdgeToItem).toBe(false);
    expect(props.initialIndex).toBe(0);
    expect(props.keyExtractor(photos[1], 1)).toBe('b');
    // Windowed: the photo in view and one either side, not the whole trip.
    expect(screen.queryByTestId('photo-c')).toBeNull();
    expect(screen.getByTestId('photo-b')).toBeTruthy();
  });

  test('reports a swipe to another photo, once, and not a move it was told about', async () => {
    const { onIndexChange } = await renderGallery();

    await act(async () => gallery().props.onIndexChange(1));
    expect(onIndexChange).toHaveBeenCalledWith(1);

    onIndexChange.mockClear();
    await act(async () => gallery().props.onIndexChange(0));
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  test('moves the gallery when the parent changes the index, not on mount', async () => {
    const { view } = await renderGallery({ index: 1 });
    expect(gallery().ref?.setIndex).not.toHaveBeenCalled();

    await view.rerender(
      <PhotoGallery
        data={photos}
        index={2}
        keyOf={(p) => p.id}
        renderPhoto={(p) => <NativeText>{p.id}</NativeText>}
        onIndexChange={jest.fn()}
        onPullDown={jest.fn()}
      />,
    );
    expect(gallery().ref?.setIndex).toHaveBeenCalledWith(2);
  });

  test('does not push the index back to the gallery after its own swipe', async () => {
    const { view, onIndexChange } = await renderGallery();
    await act(async () => gallery().props.onIndexChange(1));
    const setIndex = gallery().ref?.setIndex;
    setIndex?.mockClear();

    await view.rerender(
      <PhotoGallery
        data={photos}
        index={1}
        keyOf={(p) => p.id}
        renderPhoto={(p) => <NativeText>{p.id}</NativeText>}
        onIndexChange={onIndexChange}
        onPullDown={jest.fn()}
      />,
    );
    expect(setIndex).not.toHaveBeenCalled();
  });

  test('closes on a pull down that is let go far enough, never mid-pull or on a short one', async () => {
    const { onPullDown } = await renderGallery();
    const pull = gallery().props.onVerticalPull;

    pull({ translateY: 300, released: false, velocityY: 2000 });
    pull({ translateY: 20, released: true, velocityY: 10 });
    expect(onPullDown).not.toHaveBeenCalled();

    pull({ translateY: PULL_CLOSE_DISTANCE + 10, released: true, velocityY: 10 });
    expect(onPullDown).toHaveBeenCalledTimes(1);
  });

  test('with reduced motion the snap back does not animate', async () => {
    await renderGallery({ reducedMotion: true });
    expect(gallery().props.snapTimingConfig).toEqual({ duration: 0 });
  });

  test('with motion allowed the toolkit keeps its own timing', async () => {
    await renderGallery();
    expect(gallery().props.snapTimingConfig).toBeUndefined();
  });
});

describe('<ProgressivePhoto> - thumbnail first, then the full image', () => {
  const base: ProgressivePhotoProps = {
    uri: 'file:///docs/photos/t/p.jpg',
    thumbnailUri: 'file:///docs/photos/t/p.thumb.jpg',
    label: 'Roma, 12 May',
    size: ROOM,
    recyclingKey: 'p',
    missingText: 'not stored',
    errorText: 'cannot draw',
  };
  const draw = (props: Partial<ProgressivePhotoProps> = {}) =>
    render(<ProgressivePhoto {...base} {...props} />);

  test('draws the thumbnail under the full image, both contained, the full one named', async () => {
    await draw();
    const thumb = screen.getByTestId('photo-viewer-thumbnail', hidden);
    const full = screen.getByTestId('photo-viewer-image');

    expect(thumb.props.source).toEqual({ uri: base.thumbnailUri });
    expect(full.props.source).toEqual({ uri: base.uri });
    expect(thumb.props.contentFit).toBe('contain');
    expect(full.props.contentFit).toBe('contain');
    expect(full.props.accessibilityLabel).toBe('Roma, 12 May');
    expect(thumb.props.accessibilityElementsHidden).toBe(true);
    expect(full.props.recyclingKey).toBe('p');
    expect(thumb.props.recyclingKey).not.toBe('p');
  });

  test('fades the full image in, and not at all with reduced motion', async () => {
    await draw();
    expect(screen.getByTestId('photo-viewer-image').props.transition).toBe(FADE_IN_MS);
    await screen.unmount();
    await draw({ reducedMotion: true });
    expect(screen.getByTestId('photo-viewer-image').props.transition).toBe(0);
  });

  test('takes the photo’s proportions from the first image to load, so the zoom is the picture’s', async () => {
    await draw();
    const frame = () =>
      StyleSheet.flatten(screen.getByTestId('photo-viewer-image-frame').props.style);
    expect(frame()).toMatchObject(ROOM);

    await act(async () => {
      fireEvent(screen.getByTestId('photo-viewer-thumbnail', hidden), 'load', {
        source: { width: 400, height: 200 },
      });
    });
    expect(frame()).toMatchObject({ width: 300, height: 150 });
  });

  test('keeps the thumbnail until the full image is on screen, then drops it', async () => {
    await draw();
    await act(async () => {
      fireEvent(screen.getByTestId('photo-viewer-image'), 'load', {
        source: { width: 400, height: 200 },
      });
    });
    expect(screen.getByTestId('photo-viewer-thumbnail', hidden)).toBeTruthy();

    await act(async () => {
      fireEvent(screen.getByTestId('photo-viewer-image'), 'display');
    });
    expect(screen.queryByTestId('photo-viewer-thumbnail', hidden)).toBeNull();
    expect(screen.getByTestId('photo-viewer-image')).toBeTruthy();
  });

  test('a thumbnail that will not draw is dropped without a word: it was only a placeholder', async () => {
    await draw();
    await act(async () => {
      fireEvent(screen.getByTestId('photo-viewer-thumbnail', hidden), 'error', {
        error: 'x',
      });
    });
    expect(screen.queryByTestId('photo-viewer-thumbnail', hidden)).toBeNull();
    expect(screen.getByTestId('photo-viewer-image')).toBeTruthy();
    expect(screen.queryByText('cannot draw')).toBeNull();
  });

  test('works with no thumbnail at all', async () => {
    await draw({ thumbnailUri: null });
    expect(screen.queryByTestId('photo-viewer-thumbnail', hidden)).toBeNull();
    expect(screen.getByTestId('photo-viewer-image')).toBeTruthy();
  });

  test('a full image that will not draw says so, and the thumbnail does not stand in for it', async () => {
    await draw();
    await act(async () => {
      fireEvent(screen.getByTestId('photo-viewer-image'), 'error', { error: 'decode' });
    });
    expect(screen.getByTestId('photo-viewer-image-unavailable')).toHaveTextContent(
      'cannot draw',
    );
    expect(screen.queryByTestId('photo-viewer-image')).toBeNull();
    expect(screen.queryByTestId('photo-viewer-thumbnail', hidden)).toBeNull();
  });

  test('a photo with no file on this device says where it is', async () => {
    await draw({ uri: null });
    expect(screen.getByText('not stored')).toBeTruthy();
    expect(screen.queryByTestId('photo-viewer-image')).toBeNull();
  });
});

describe('the fence around the toolkit', () => {
  const SRC = join(__dirname, '..', '..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });

  test('only components/ui imports react-native-zoom-toolkit, and only this file', () => {
    const importers = files(SRC)
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) =>
        /from\s+'react-native-zoom-toolkit'/.test(readFileSync(file, 'utf8')),
      )
      .map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/'));
    expect(importers).toEqual(['components/ui/photo-viewer.tsx']);
  });

  test('reads no network address: the caller hands over the file URIs', () => {
    const source = readFileSync(join(__dirname, 'photo-viewer.tsx'), 'utf8');
    expect(source).not.toMatch(/https?:\/\/(?!docs\.expo)/);
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|getSignedUrl/);
  });
});
