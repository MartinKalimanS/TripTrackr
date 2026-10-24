/**
 * `PhotoGallery` and `ProgressivePhoto` - the zoom of the photo viewer (feature 005, T549;
 * contract C5-26; research D5-13; FR-045, FR-046). The ONLY file that imports
 * `react-native-zoom-toolkit`: a failed device check (T511) swaps this file for the
 * hand-rolled fallback of D5-13 and no screen notices.
 *
 *   <PhotoGallery data={photos} index={i} keyOf={(p) => p.id} onIndexChange={show}
 *     onPullDown={close} renderPhoto={(p, size) => <ProgressivePhoto ... />} />
 *
 * - `PhotoGallery` is the toolkit's `Gallery` in a frame that clips to the card: pinch to
 *   zoom, double-tap to zoom in and out, pan while zoomed, swipe to the next photo (only
 *   with more than one), and pull down, at the photo's own size, to close. It owns its
 *   `GestureHandlerRootView` (a React Native `Modal` is a separate root on Android, where
 *   a detector outside one never fires). Three photos are mounted at a time (`windowSize`),
 *   so a long trip does not hold every full image in memory.
 * - `index` is CONTROLLED: a change the traveller makes (a swipe) is reported through
 *   `onIndexChange`; a change the parent makes (the list moved under the photo) moves the
 *   gallery without being reported back.
 * - The pull is decided by `pullClosesViewer` (a worklet, because the toolkit calls it from
 *   the UI thread) and closes through `scheduleOnRN`, once per gesture.
 * - Reduced motion: the snap back after a swipe or a pull does not animate. The double-tap
 *   zoom is Reanimated's own timing, which already follows the system's "reduce motion".
 * - `ProgressivePhoto` is one photo, thumbnail first: the small file under the full one
 *   until the full image has drawn (the full one fades in unless motion is reduced), the
 *   photo's natural size taken from whichever loads first so the zoom bounds are the
 *   picture's and not the screen's. A photo with no file says where it is
 *   (`missingText`), and a full image that will not draw says so (`errorText`,
 *   `photo-viewer-image-unavailable`) instead of leaving the thumbnail up as if it were the photo.
 *   A thumbnail that cannot be drawn is dropped silently: it is only a placeholder.
 *
 * Nothing here reads a network address: the caller hands over the `file://` URIs of the
 * traveller's own private files, which is what the viewer drew before the zoom.
 *
 * UNVERIFIED ON A DEVICE (tasks.md T511, T549): the pinch, double-tap, pan, swipe and pull
 * on Reanimated 4.5.1 and Gesture Handler 2.32 (the toolkit was written against 4.1.1 and
 * 2.28). Jest runs a stand-in (`test/mocks/react-native-zoom-toolkit.tsx`).
 */
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { Gallery, type GalleryRefType } from 'react-native-zoom-toolkit';

import { Text } from './text';

/** The most a photo zooms in, as a multiple of its fitted size. */
export const MAX_ZOOM = 6;
/** Photos mounted at once: the one in view and one either side. */
export const GALLERY_WINDOW = 3;
/** A pull down of this many dp, or a fling this fast (dp per second), closes the viewer. */
export const PULL_CLOSE_DISTANCE = 96;
export const PULL_CLOSE_VELOCITY = 900;
/** Until the card is measured, its room is guessed as this share of the window's height. */
export const ESTIMATE_HEIGHT_SHARE = 0.5;
/** The full image fades in over the thumbnail for this long (none with reduced motion). */
export const FADE_IN_MS = 180;

export interface Size {
  width: number;
  height: number;
}

export interface VerticalPull {
  translateY: number;
  released: boolean;
  velocityY: number;
}

/** True when a pull that has been let go is far or fast enough to close. A worklet. */
export function pullClosesViewer({ translateY, released, velocityY }: VerticalPull) {
  'worklet';
  return (
    released && (translateY >= PULL_CLOSE_DISTANCE || velocityY >= PULL_CLOSE_VELOCITY)
  );
}

/** The largest size with `natural`'s proportions that fits `box`; `box` when unknown. */
export function fitWithin(box: Size, natural: Size | null): Size {
  if (!natural || natural.width <= 0 || natural.height <= 0) return box;
  if (box.width <= 0 || box.height <= 0) return box;
  const ratio = Math.min(box.width / natural.width, box.height / natural.height);
  return { width: natural.width * ratio, height: natural.height * ratio };
}

export interface PhotoGalleryProps<T> {
  data: readonly T[];
  /** The photo in view. Controlled. */
  index: number;
  keyOf: (item: T) => string;
  /** One photo, drawn in `size`: the room the card gives it. */
  renderPhoto: (item: T, size: Size) => ReactElement;
  /** The traveller swiped to another photo. */
  onIndexChange: (index: number) => void;
  /** A pull down that was let go far or fast enough: close the viewer. */
  onPullDown: () => void;
  reducedMotion?: boolean;
}

const ROOT = { flex: 1 } as const;

/**
 * The card's room: the window's, scaled by `ESTIMATE_HEIGHT_SHARE`, until the card has been laid out
 * (so a photo is drawn at once, a frame before it is fitted), then what was measured.
 */
function useRoom() {
  const { width, height } = useWindowDimensions();
  const [measured, setMeasured] = useState<Size | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setMeasured((now) =>
      now && now.width === w && now.height === h ? now : { width: w, height: h },
    );
  };
  const room = measured ?? { width, height: Math.round(height * ESTIMATE_HEIGHT_SHARE) };
  return { room, onLayout };
}

/**
 * The gallery's handle and its change callback. `index` is the parent's: the gallery is moved
 * when it differs from the last index the gallery itself reported, and reports its own moves.
 */
function useGalleryIndex(index: number, onIndexChange: (index: number) => void) {
  const gallery = useRef<GalleryRefType>(null);
  const reported = useRef(index);
  useEffect(() => {
    if (reported.current !== index) gallery.current?.setIndex(index);
  }, [index]);
  const changed = (next: number) => {
    reported.current = next;
    if (next !== index) onIndexChange(next);
  };
  return { gallery, changed };
}

export function PhotoGallery<T>({
  data,
  index,
  keyOf,
  renderPhoto,
  onIndexChange,
  onPullDown,
  reducedMotion = false,
}: PhotoGalleryProps<T>) {
  const { room, onLayout } = useRoom();
  const { gallery, changed } = useGalleryIndex(index, onIndexChange);

  const pulled = (pull: VerticalPull) => {
    'worklet';
    if (pullClosesViewer(pull)) scheduleOnRN(onPullDown);
  };

  return (
    <GestureHandlerRootView
      testID="photo-viewer-gallery"
      style={ROOT}
      onLayout={onLayout}>
      <Gallery
        ref={gallery}
        data={data as T[]}
        initialIndex={index}
        keyExtractor={keyOf}
        renderItem={(item) => renderPhoto(item, room)}
        maxScale={MAX_ZOOM}
        windowSize={GALLERY_WINDOW}
        tapOnEdgeToItem={false}
        snapTimingConfig={reducedMotion ? { duration: 0 } : undefined}
        onIndexChange={changed}
        onVerticalPull={pulled}
      />
    </GestureHandlerRootView>
  );
}

export interface ProgressivePhotoProps {
  /** The full image, or null when this device has no file for the photo. */
  uri: string | null;
  /** The small file drawn until the full image has: optional. */
  thumbnailUri: string | null;
  label: string;
  /** The room to fit the photo in. */
  size: Size;
  recyclingKey: string;
  missingText: string;
  errorText: string;
  reducedMotion?: boolean;
}

interface LoadedEvent {
  source?: { width?: number; height?: number };
}

const naturalOf = ({ source }: LoadedEvent): Size | null =>
  source?.width && source?.height ? { width: source.width, height: source.height } : null;

function Unavailable({ text, broken = false }: { text: string; broken?: boolean }) {
  return (
    <Text
      variant="label"
      tone="onPhoto"
      testID={broken ? 'photo-viewer-image-unavailable' : undefined}
      className="px-4 text-center">
      {text}
    </Text>
  );
}

export function ProgressivePhoto({
  uri,
  thumbnailUri,
  label,
  size,
  recyclingKey,
  missingText,
  errorText,
  reducedMotion = false,
}: ProgressivePhotoProps) {
  const [natural, setNatural] = useState<Size | null>(null);
  const [fullDrawn, setFullDrawn] = useState(false);
  const [thumbBroken, setThumbBroken] = useState(false);
  const [fullBroken, setFullBroken] = useState(false);

  if (!uri) return <Unavailable text={missingText} />;
  if (fullBroken) return <Unavailable text={errorText} broken />;

  const fitted = fitWithin(size, natural);
  const learn = (event: LoadedEvent) => setNatural((known) => known ?? naturalOf(event));
  const showThumbnail = thumbnailUri !== null && !thumbBroken && !fullDrawn;

  return (
    <View testID="photo-viewer-image-frame" style={fitted}>
      {showThumbnail ? (
        <Image
          testID="photo-viewer-thumbnail"
          source={{ uri: thumbnailUri }}
          recyclingKey={`${recyclingKey}-thumbnail`}
          contentFit="contain"
          transition={0}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onLoad={learn}
          onError={() => setThumbBroken(true)}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Image
        testID="photo-viewer-image"
        source={{ uri }}
        recyclingKey={recyclingKey}
        contentFit="contain"
        transition={reducedMotion ? 0 : FADE_IN_MS}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        onLoad={learn}
        onDisplay={() => setFullDrawn(true)}
        onError={() => setFullBroken(true)}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
