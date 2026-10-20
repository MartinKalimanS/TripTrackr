/**
 * The Jest stand-in for `react-native-zoom-toolkit` (feature 005, research D5-13, D5-19).
 *
 * `jest.setup.ts` installs it for every suite with
 * `jest.mock('react-native-zoom-toolkit', () => require('./test/mocks/react-native-zoom-toolkit'))`.
 * The real components are built on Reanimated shared values and Gesture Handler
 * gestures, neither of which runs under Jest (merely importing the package fails on
 * `clamp` of the Reanimated stand-in). Only the two components the plan uses are here,
 * `ResumableZoom` and `Gallery`; a name missing from this file is `undefined` and fails
 * loudly with React's "Element type is invalid": add the export rather than loosening
 * it. `test/mocks/native-batch.test.tsx` pins the shape; pinch, double-tap, swipe and
 * pull-to-close on Reanimated 4.5.1 and Gesture Handler 2.32 are the device check V5
 * (tasks T511).
 *
 * What they do, and do not do:
 * - `ResumableZoom` renders its `children` in a `View` (`zoom-resumable`) that carries the
 *   props it was given. Its ref answers the real methods as `jest.fn`s (`reset`,
 *   `zoom`, `setTransformState`, `getState`, `getVisibleRect`) with the real defaults: scale
 *   `minScale` (1), no translation, `maxScale` 6.
 * - `Gallery` clamps `initialIndex` to the data, as the provider does, and draws only the
 *   items within `floor(windowSize / 2)` (default `windowSize` 5, so two each side) of the
 *   active index, each through the caller's `renderItem(item, index)` and keyed by
 *   `keyExtractor` (default `item-<index>`). It calls `onIndexChange` once on mount with
 *   the start index (a Reanimated reaction runs on mount) and again whenever the index
 *   changes, which the ref's `setIndex` (clamped, like the real one) does.
 * - A suite reads the latest props and ref handle through `__gallery()` and `__zoom()`,
 *   to fire `onVerticalPull`, `onTap` or `onIndexChange` as the gestures would.
 * - Nothing zooms, pans, scrolls or animates.
 *
 * The bookkeeping goes through small module-level functions (`record`, `sync`) because the
 * React Compiler's lint refuses a component that writes to a module variable or reads a
 * ref while rendering; a function it cannot see into is where such a write belongs.
 */
import {
  createElement,
  useEffect,
  useImperativeHandle,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from 'react';
import { View } from 'react-native';

type StandInProps = Record<string, unknown>;
const Host = View as unknown as ComponentType<StandInProps>;
const DEFAULT_MAX_SCALE = 6;
const DEFAULT_WINDOW = 5;

type ZoomState = {
  containerSize: { width: number; height: number };
  childSize: { width: number; height: number };
  maxScale: number;
  translateX: number;
  translateY: number;
  scale: number;
};

const clampIndex = (index: number, length: number) =>
  Math.min(Math.max(index, 0), Math.max(length - 1, 0));

function zoomState(maxScale: number, scale: number): ZoomState {
  return {
    containerSize: { width: 1, height: 1 },
    childSize: { width: 1, height: 1 },
    maxScale,
    translateX: 0,
    translateY: 0,
    scale,
  };
}

/** The latest props and ref handle a component was rendered with, for the suite to read. */
type Last<Handle> = { props: StandInProps; ref: Handle | null };

function record<Handle>(last: Last<Handle>, props: StandInProps, ref: Handle) {
  last.props = props;
  last.ref = ref;
}

type ZoomHandle = {
  reset: jest.Mock;
  zoom: jest.Mock;
  setTransformState: jest.Mock;
  getState: jest.Mock<ZoomState, []>;
  getVisibleRect: jest.Mock;
};

const lastZoom: Last<ZoomHandle> = { props: {}, ref: null };

function zoomHandle(maxScale: unknown, minScale: number): ZoomHandle {
  const max = typeof maxScale === 'number' ? maxScale : DEFAULT_MAX_SCALE;
  return {
    reset: jest.fn(),
    zoom: jest.fn(),
    setTransformState: jest.fn(),
    getState: jest.fn(() => zoomState(max, minScale)),
    getVisibleRect: jest.fn(() => ({ x: 0, y: 0, width: 1, height: 1 })),
  };
}

export function ResumableZoom({
  ref,
  children,
  testID,
  ...props
}: StandInProps & { ref?: Ref<ZoomHandle>; children?: ReactNode }) {
  const { minScale = 1, maxScale = DEFAULT_MAX_SCALE } = props as {
    minScale?: number;
    maxScale?: number | object;
  };
  const [handle] = useState(() => zoomHandle(maxScale, minScale));
  useImperativeHandle(ref, () => handle, [handle]);
  useEffect(() => {
    record(lastZoom, { ...props, minScale, maxScale }, handle);
  });
  return createElement(Host, { testID: testID ?? 'zoom-resumable' }, children);
}

type GalleryHandle = {
  setIndex: jest.Mock;
  reset: jest.Mock;
  getState: jest.Mock<ZoomState, []>;
};

type GalleryStandInProps = {
  ref?: Ref<GalleryHandle>;
  data: unknown[];
  renderItem: (item: unknown, index: number) => ReactNode;
  keyExtractor?: (item: unknown, index: number) => string;
  initialIndex?: number;
  windowSize?: number;
  onIndexChange?: (index: number) => void;
  [prop: string]: unknown;
};

const lastGallery: Last<GalleryHandle> = { props: {}, ref: null };

/** What the ref methods and the mount reaction read: the latest data and callback. */
type GalleryBox = { length: number; onIndexChange?: (index: number) => void };

function sync(box: GalleryBox, props: GalleryStandInProps) {
  box.length = props.data.length;
  box.onIndexChange = props.onIndexChange;
}

function galleryHandle(setActive: (index: number) => void, box: GalleryBox) {
  return {
    setIndex: jest.fn((index: number) => setActive(clampIndex(index, box.length))),
    reset: jest.fn(),
    getState: jest.fn(() => zoomState(DEFAULT_MAX_SCALE, 1)),
  };
}

export function Gallery({ ref, ...props }: GalleryStandInProps) {
  const { data, renderItem, keyExtractor } = props;
  const start = clampIndex(props.initialIndex ?? 0, data.length);
  const [active, setActive] = useState(start);
  const [box] = useState<GalleryBox>(() => ({ length: 0 }));
  const [handle] = useState(() => galleryHandle(setActive, box));
  useImperativeHandle(ref, () => handle, [handle]);
  useEffect(() => {
    sync(box, props);
    record(lastGallery, { ...props, initialIndex: start }, handle);
  });
  // A reaction runs on mount and on every change of the active index, never on a re-render.
  useEffect(() => {
    box.onIndexChange?.(active);
  }, [active, box]);

  const reach = Math.floor((props.windowSize ?? DEFAULT_WINDOW) / 2);
  return createElement(
    Host,
    { testID: 'zoom-gallery' },
    data.map((item, index) =>
      Math.abs(index - active) > reach
        ? null
        : createElement(
            Host,
            {
              key: keyExtractor?.(item, index) ?? `item-${index}`,
              testID: `zoom-gallery-item-${index}`,
            },
            renderItem(item, index),
          ),
    ),
  );
}

/** The latest props (and ref handle) the gallery was rendered with. */
export const __gallery = () => lastGallery;
/** The latest props (and ref handle) the resumable zoom was rendered with. */
export const __zoom = () => lastZoom;
