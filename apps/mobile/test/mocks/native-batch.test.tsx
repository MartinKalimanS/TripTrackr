/**
 * Feature 005, T503 (research D5-19): the Jest stand-ins for the native batch.
 *
 * `expo-glass-effect`, `react-native-view-shot` and `react-native-zoom-toolkit` need a
 * native view or module, a Reanimated worklets runtime or a gesture handler, none of
 * which exists under Jest, so `jest.setup.ts` installs one stand-in for each (the files
 * in `test/mocks/`), the way it does for `heroui-native`. Phosphor needs no stand-in: its
 * icons are plain `react-native-svg` trees, and what Jest must guarantee is that a deep
 * import is transformed and renders, and that nothing loads the 1,500-icon barrel
 * (research D5-07).
 *
 * Each stand-in is held to the contract of the real module (the typings and the source in
 * `node_modules`), so a suite that passes against it would also pass on a device: a
 * capture of a view that is not laid out rejects, the glass is unavailable until a suite
 * says otherwise (as on Android and before iOS 26), the gallery draws every item through
 * the real `renderItem`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { GlobeIcon } from 'phosphor-react-native/src/icons/Globe';
import { createRef, useRef } from 'react';
import { Text, View } from 'react-native';
import ViewShot, {
  captureRef,
  captureScreen,
  releaseCapture,
} from 'react-native-view-shot';
import {
  Gallery,
  ResumableZoom,
  type GalleryRefType,
  type ResumableZoomRefType,
} from 'react-native-zoom-toolkit';

// The stand-ins' own test hooks (`__gallery`, `__zoom`) are not on the real module's
// types, so a suite reaches them through the module registry.
const zoomHooks = jest.requireMock('react-native-zoom-toolkit') as {
  __gallery: () => { props: Record<string, unknown>; ref: GalleryRefType | null };
  __zoom: () => { props: Record<string, unknown>; ref: ResumableZoomRefType | null };
};

describe('expo-glass-effect stand-in', () => {
  test('GlassView is a view that carries the glass props and renders its children', async () => {
    await render(
      <GlassView
        glassEffectStyle="regular"
        tintColor="#123456"
        isInteractive
        colorScheme="dark"
        accessibilityLabel="tab pill">
        <Text>inside</Text>
      </GlassView>,
    );
    const glass = screen.getByTestId('glass-view');
    expect(glass.props).toMatchObject({
      glassEffectStyle: 'regular',
      tintColor: '#123456',
      isInteractive: true,
      colorScheme: 'dark',
      accessibilityLabel: 'tab pill',
    });
    expect(screen.getByText('inside')).toBeOnTheScreen();
  });

  test('GlassView keeps a caller testID and hands its ref the host view', async () => {
    const ref = createRef<View>();
    await render(<GlassView ref={ref} testID="tab-surface" />);
    expect(screen.getByTestId('tab-surface')).toBeOnTheScreen();
    expect(ref.current).not.toBeNull();
  });

  test('GlassContainer groups glass views and keeps its spacing', async () => {
    await render(
      <GlassContainer spacing={12}>
        <GlassView />
      </GlassContainer>,
    );
    expect(screen.getByTestId('glass-container').props.spacing).toBe(12);
    expect(screen.getByTestId('glass-view')).toBeOnTheScreen();
  });

  test('the glass is unavailable by default, as on Android and before iOS 26', () => {
    expect(jest.isMockFunction(isLiquidGlassAvailable)).toBe(true);
    expect(isLiquidGlassAvailable()).toBe(false);
    expect(isGlassEffectAPIAvailable()).toBe(false);
  });

  test('a suite switches the glass on for one call, then it is off again', () => {
    (isLiquidGlassAvailable as jest.Mock).mockReturnValueOnce(true);
    expect(isLiquidGlassAvailable()).toBe(true);
    expect(isLiquidGlassAvailable()).toBe(false);
  });
});

describe('react-native-view-shot stand-in', () => {
  test('captureRef resolves a temporary PNG file URI by default', async () => {
    const ref = { current: {} };
    const uri = await captureRef(ref);
    expect(uri).toMatch(/^file:\/\/\/.+\.png$/);
    expect(captureRef).toHaveBeenCalledWith(ref);
  });

  test('captureRef names the file after the requested format', async () => {
    await expect(captureRef({ current: {} }, { format: 'jpg' })).resolves.toMatch(
      /\.jpg$/,
    );
  });

  test('captureRef answers the requested result: base64 raw, data-uri with its header', async () => {
    const view = { current: {} };
    const raw = await captureRef(view, { result: 'base64' });
    expect(raw).not.toMatch(/^data:|^file:/);
    const dataUri = await captureRef(view, { result: 'data-uri', format: 'png' });
    expect(dataUri).toMatch(/^data:image\/png;base64,/);
  });

  test('captureRef rejects a view that is not laid out, as the native module does', async () => {
    await expect(captureRef(null)).rejects.toThrow('findNodeHandle failed to resolve');
    await expect(captureRef({ current: null })).rejects.toThrow(
      'findNodeHandle failed to resolve',
    );
  });

  test('captureScreen and releaseCapture exist and answer', async () => {
    await expect(captureScreen()).resolves.toMatch(/^file:\/\//);
    expect(releaseCapture('file:///x.png')).toBeUndefined();
    expect(releaseCapture).toHaveBeenCalledWith('file:///x.png');
  });

  test('the ViewShot component exposes capture() on its ref, which captures its own node', async () => {
    function Probe() {
      const ref = useRef<React.ElementRef<typeof ViewShot>>(null);
      return (
        <ViewShot ref={ref} options={{ format: 'png' }}>
          <Text onPress={() => void ref.current?.capture()}>roundel</Text>
        </ViewShot>
      );
    }
    await render(<Probe />);
    expect(screen.getByText('roundel')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('roundel'));
    expect(captureRef).toHaveBeenCalledWith(
      { current: expect.anything() },
      { format: 'png' },
    );
    expect(ViewShot.captureRef).toBe(captureRef);
    expect(ViewShot.releaseCapture).toBe(releaseCapture);
  });
});

describe('react-native-zoom-toolkit stand-in', () => {
  test('ResumableZoom renders its children and keeps its props', async () => {
    await render(
      <ResumableZoom maxScale={4} extendGestures>
        <Text>photo</Text>
      </ResumableZoom>,
    );
    expect(screen.getByTestId('zoom-resumable')).toBeOnTheScreen();
    expect(screen.getByText('photo')).toBeOnTheScreen();
    expect(zoomHooks.__zoom().props).toMatchObject({ maxScale: 4, extendGestures: true });
  });

  test('ResumableZoom answers the ref methods the viewer calls', async () => {
    const ref = createRef<ResumableZoomRefType>();
    await render(
      <ResumableZoom ref={ref}>
        <View />
      </ResumableZoom>,
    );
    ref.current?.reset(true);
    ref.current?.zoom(2);
    expect(ref.current?.reset).toHaveBeenCalledWith(true);
    expect(ref.current?.zoom).toHaveBeenCalledWith(2);
    expect(ref.current?.getState()).toMatchObject({
      scale: 1,
      maxScale: 6,
      translateX: 0,
    });
  });

  describe('Gallery', () => {
    const photos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const many = Array.from({ length: 9 }, (_, index) => ({ id: `p${index}` }));

    test('draws each item through the real renderItem, keyed by keyExtractor', async () => {
      await render(
        <Gallery
          data={photos}
          keyExtractor={(photo) => photo.id}
          renderItem={(photo, index) => <Text>{`${index}:${photo.id}`}</Text>}
        />,
      );
      expect(screen.getByTestId('zoom-gallery')).toBeOnTheScreen();
      expect(screen.getByText('0:a')).toBeOnTheScreen();
      expect(screen.getByText('2:c')).toBeOnTheScreen();
    });

    test('draws only the window around the active item, two each side by default', async () => {
      await render(
        <Gallery
          data={many}
          initialIndex={4}
          renderItem={(photo) => <Text>{photo.id}</Text>}
        />,
      );
      expect(screen.getAllByTestId(/^zoom-gallery-item-/)).toHaveLength(5);
      expect(screen.getByText('p2')).toBeOnTheScreen();
      expect(screen.getByText('p6')).toBeOnTheScreen();
      expect(screen.queryByText('p1')).toBeNull();
      expect(screen.queryByText('p7')).toBeNull();
    });

    test('clamps initialIndex to the data and reports the start index on mount', async () => {
      const onIndexChange = jest.fn();
      await render(
        <Gallery
          data={photos}
          initialIndex={9}
          onIndexChange={onIndexChange}
          renderItem={(photo) => <Text>{photo.id}</Text>}
        />,
      );
      expect(zoomHooks.__gallery().props.initialIndex).toBe(2);
      expect(onIndexChange).toHaveBeenCalledTimes(1);
      expect(onIndexChange).toHaveBeenCalledWith(2);
    });

    test('hands a suite the callbacks the viewer registered', async () => {
      const onVerticalPull = jest.fn();
      const onTap = jest.fn();
      await render(
        <Gallery
          data={photos}
          onVerticalPull={onVerticalPull}
          onTap={onTap}
          renderItem={(photo) => <Text>{photo.id}</Text>}
        />,
      );
      const { props } = zoomHooks.__gallery();
      expect(props.onVerticalPull).toBe(onVerticalPull);
      expect(props.onTap).toBe(onTap);
    });

    test('setIndex moves the window and reports the new index, clamped', async () => {
      const onIndexChange = jest.fn();
      const ref = createRef<GalleryRefType>();
      await render(
        <Gallery
          ref={ref}
          data={many}
          onIndexChange={onIndexChange}
          renderItem={(photo) => <Text>{photo.id}</Text>}
        />,
      );
      await act(async () => ref.current?.setIndex(7));
      expect(ref.current?.setIndex).toHaveBeenCalledWith(7);
      expect(onIndexChange).toHaveBeenLastCalledWith(7);
      expect(screen.getByText('p8')).toBeOnTheScreen();
      expect(screen.queryByText('p0')).toBeNull();
      await act(async () => ref.current?.setIndex(40));
      expect(onIndexChange).toHaveBeenLastCalledWith(8);
    });

    test('answers the other ref methods with the real defaults', async () => {
      const ref = createRef<GalleryRefType>();
      await render(
        <Gallery
          ref={ref}
          data={photos}
          renderItem={(photo) => <Text>{photo.id}</Text>}
        />,
      );
      ref.current?.reset(false);
      expect(ref.current?.reset).toHaveBeenCalledWith(false);
      expect(ref.current?.getState()).toMatchObject({
        scale: 1,
        translateX: 0,
        translateY: 0,
        maxScale: 6,
      });
    });
  });
});

describe('phosphor-react-native deep imports', () => {
  test('an icon imported by its deep path renders with its name and weight in the testID', async () => {
    await render(<GlobeIcon weight="fill" size={20} color="#112233" />);
    const icon = screen.getByTestId('phosphor-react-native-globe-fill');
    expect(icon.props).toMatchObject({ width: 20, height: 20 });
  });

  test('the barrel is refused, so Metro and Jest never load all 1,500 icons (D5-07)', () => {
    expect(() => jest.requireActual('phosphor-react-native')).toThrow(
      /deep path.*phosphor-react-native\/src\/icons\//s,
    );
  });
});
