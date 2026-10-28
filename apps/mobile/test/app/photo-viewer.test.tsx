/**
 * The photo viewer as the picture draws it (feature 005, T549; contract C5-26; UI-SPEC 9.2;
 * `reference/screens/more/photo-viewer.png`; owner answer Q-11). Rendered directly, with the
 * zoom toolkit's stand-in (`test/mocks/react-native-zoom-toolkit.tsx`); the gestures
 * themselves are device check T511. Pinned here:
 *
 *   - the layout: a full-screen modal, the photo on its own blurred ambient, the glass 44 dp
 *     close control named "Close photo", the place line, the rounded card, the sheet;
 *   - zoom and gestures asked of the toolkit: pinch and double-tap up to the cap, swipe
 *     between, pull down to close, none of them reaching a write;
 *   - progressive loading: the thumbnail first, then the full image, and an honest error;
 *   - every pictured control without a capability (Share twice, More, the caption row, Save
 *     copy) is a real button that shows one toast and does nothing else;
 *   - dark, increased contrast, reduced motion, text scales, the safe areas and Android's Back.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { PhotoViewer, type PhotoViewerProps } from '@/components/trip/photo-viewer';
import { PULL_CLOSE_DISTANCE } from '@/components/ui/photo-viewer';
import type { PhotoWithPlace } from '@/db/repositories/photos';

import { DOCUMENTS } from '../features/photo-fakes';
import { appearance, appearanceOf } from '../helpers/appearance';
import { glyphId } from '../helpers/icons';
import {
  TRIP,
  failed,
  hidden,
  mockActions,
  mockStops,
  pending,
  photo,
  styleOf,
  uploaded,
} from './photo-screen-harness';

jest.mock('expo-file-system', () =>
  jest.requireActual('../features/photo-fakes').createFileSystemMock(),
);
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});
jest.mock('expo-status-bar', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    StatusBar: (props: Record<string, unknown>) =>
      React.createElement(Host, { testID: 'photo-viewer-status-bar', ...props }),
  };
});
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-font-scale');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const { useFontScale } = jest.requireMock('@/hooks/use-font-scale') as {
  useFontScale: jest.Mock;
};
const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock; hide: jest.Mock };
};
const zoomHooks = jest.requireMock('react-native-zoom-toolkit') as {
  __gallery: () => { props: Record<string, any>; ref: { setIndex: jest.Mock } | null };
};

const FULL = `${DOCUMENTS}/photos/${TRIP}/${uploaded.id}.jpg`;
const THUMB = `${DOCUMENTS}/photos/${TRIP}/${uploaded.id}.thumb.jpg`;

const onClose = jest.fn();
const onChange = jest.fn();

beforeEach(() => {
  useAppearance.mockReturnValue(appearance());
  useFontScale.mockReturnValue(1);
  for (const mock of [onClose, onChange, mockToast.show, mockToast.hide])
    mock.mockClear();
  for (const mock of Object.values(mockActions)) mock.mockReset();
});

function open(
  props: Partial<PhotoViewerProps> = {},
  insets?: { top: number; bottom: number },
) {
  const viewer = (
    <PhotoViewer
      photo={uploaded}
      stops={mockStops.data}
      actions={mockActions}
      onClose={onClose}
      {...props}
    />
  );
  return render(
    insets ? (
      <SafeAreaInsetsContext.Provider value={{ ...insets, left: 0, right: 0 }}>
        {viewer}
      </SafeAreaInsetsContext.Provider>
    ) : (
      viewer
    ),
  );
}

const sequence = [photo('11111111'), photo('22222222'), photo('33333333')];

describe('<PhotoViewer> - the picture (photo-viewer.png)', () => {
  test('is a full-screen modal whose ground is dark in every theme, with the ids kept', async () => {
    await open();
    const modal = screen.getByTestId('photo-viewer-modal');
    expect(modal.props.presentationStyle).toBe('fullScreen');
    expect(modal.props.visible).toBe(true);

    const root = within(modal).getByTestId('photo-viewer');
    expect(String(root.props.className)).toContain('bg-toast-surface');
    expect(within(root).getByTestId('photo-viewer-place')).toBeTruthy();
    expect(within(root).getByTestId('photo-viewer-image')).toBeTruthy();
  });

  test('the photo sits on its own ambient: the thumbnail, blurred, under a scrim, decoration only', async () => {
    await open();
    const ambient = screen.getByTestId('photo-viewer-ambient', hidden);
    expect(ambient.props.pointerEvents).toBe('none');
    expect(ambient.props.accessibilityElementsHidden).toBe(true);
    expect(ambient.props.importantForAccessibility).toBe('no-hide-descendants');

    const image = within(ambient).getByTestId('photo-viewer-ambient-image', hidden);
    expect(image.props.source).toEqual({ uri: THUMB });
    expect(image.props.blurRadius).toBe(34);
    expect(image.props.contentFit).toBe('cover');
    expect(StyleSheet.flatten(image.props.style).transform).toEqual([{ scale: 1.2 }]);
    expect(within(ambient).getByTestId('scrim-top', hidden)).toBeTruthy();
    expect(
      String(
        within(ambient).getByTestId('photo-viewer-ambient-scrim', hidden).props.className,
      ),
    ).toContain('bg-scrim-button');
  });

  test('Close is the glass 44 dp disc named "Close photo"; it closes', async () => {
    await open();
    const close = screen.getByLabelText('Close photo');
    expect(close).toBe(screen.getByTestId('photo-viewer-close'));
    expect(close.props.accessibilityRole).toBe('button');
    expect(styleOf(close).width).toBe(44);
    expect(styleOf(close).height).toBe(44);
    expect(within(close).getByTestId(glyphId('x'), hidden)).toBeTruthy();

    await fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('the photo is in a rounded card with a hairline edge and nothing across it', async () => {
    await open();
    const stage = screen.getByTestId('photo-viewer-stage');
    const style = styleOf(stage);
    expect(style.borderRadius).toBe(24);
    expect(style.borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(style.overflow).toBe('hidden');
    expect(style.backgroundColor).toBeUndefined();
    expect(style.boxShadow).toBeUndefined();
    expect(style.marginHorizontal).toBe(20);
  });

  test('the sheet is the paper surface with 28 dp top corners and a decorative grabber', async () => {
    await open();
    const sheet = screen.getByTestId('photo-viewer-sheet');
    expect(String(sheet.props.className)).toContain('bg-surface');
    expect(styleOf(sheet)).toMatchObject({
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    });
    const grabber = screen.getByTestId('photo-viewer-grabber', hidden);
    expect(grabber.props.accessibilityElementsHidden).toBe(true);
    expect(String(grabber.props.className)).toContain('bg-grab');
  });

  test('the place line, the time and the upload state read in the app’s words, in the picture’s order', async () => {
    await open();
    expect(screen.getByTestId('photo-viewer-place')).toHaveTextContent(
      'Filed under Roma, Italy',
    );
    expect(screen.getByText('Taken 12 May 2026, 18:30 (Roma time)')).toBeTruthy();
    expect(screen.getByText('Uploaded to your account.')).toBeTruthy();
    expect(screen.queryByTestId('photo-status-icon', hidden)).toBeNull();
  });

  test('a photo not yet uploaded says so beside the place, never as saved', async () => {
    await open({ photo: pending });
    expect(screen.getByLabelText('Waiting to upload')).toBeTruthy();
    expect(
      screen.getByText('Saved on this device only. It uploads when you’re online.'),
    ).toBeTruthy();
  });

  test('says where the photo is filed when no city, and a contradicting filing is said, not corrected', async () => {
    await open({
      photo: photo('44444444', {
        city_id: 101,
        city_name: 'Firenze',
        city_lat: 43.7696,
        city_lng: 11.2558,
      }),
    });
    expect(screen.getByTestId('photo-viewer-mismatch')).toHaveTextContent(
      /taken about 23\d km from Firenze/,
    );
    expect(mockActions.refile).not.toHaveBeenCalled();
  });
});

describe('<PhotoViewer> - safe areas and the platform', () => {
  test('the top bar clears the status bar and the sheet clears the home indicator', async () => {
    await open({}, { top: 47, bottom: 34 });
    const bar = styleOf(screen.getByTestId('photo-viewer-bar'));
    expect(bar.paddingTop).toBe(47 + 12);
    expect(bar.paddingHorizontal).toBe(20);

    const content = within(screen.getByTestId('photo-viewer-sheet')).getByTestId(
      'photo-viewer-sheet-scroll',
    );
    expect(StyleSheet.flatten(content.props.contentContainerStyle).paddingBottom).toBe(
      34 + 16,
    );
  });

  test('with no insets (a test, a device without notches) the bar still has its own margin', async () => {
    await open();
    expect(styleOf(screen.getByTestId('photo-viewer-bar')).paddingTop).toBe(12);
  });

  test('Android’s Back is the modal’s request to close, and closes', async () => {
    await open();
    await act(async () =>
      screen.getByTestId('photo-viewer-modal').props.onRequestClose(),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('the sheet scrolls past a share of the window, so large text never pushes a control off', async () => {
    await open();
    const sheet = screen.getByTestId('photo-viewer-sheet');
    expect(styleOf(sheet).maxHeight).toBeGreaterThan(0);
    expect(
      within(sheet).getByTestId('photo-viewer-sheet-scroll').props
        .keyboardShouldPersistTaps,
    ).toBe('handled');
  });

  test('the status bar is light over the dark ground', async () => {
    await open();
    expect(screen.getByTestId('photo-viewer-status-bar', hidden).props.style).toBe(
      'light',
    );
  });
});

describe('<PhotoViewer> - zoom and gestures through the toolkit', () => {
  test('pinch and double-tap zoom up to six times, on a three-photo window, swipe on', async () => {
    await open({ photos: sequence, photo: sequence[1], onChange });
    const { props } = zoomHooks.__gallery();

    expect(props.maxScale).toBe(6);
    expect(props.windowSize).toBe(3);
    expect(props.initialIndex).toBe(1);
    expect(props.data.map((item: PhotoWithPlace) => item.id)).toEqual(
      sequence.map((item) => item.id),
    );
  });

  test('a single photo is a gallery of one: zoom and pull work, there is nothing to swipe to', async () => {
    await open();
    const { props } = zoomHooks.__gallery();
    expect(props.data).toHaveLength(1);
    expect(props.initialIndex).toBe(0);
    expect(screen.queryByTestId('photo-viewer-position')).toBeNull();
  });

  test('a pull down that is let go far enough closes the view; a short one or a held one does not', async () => {
    await open();
    const { onVerticalPull } = zoomHooks.__gallery().props;

    onVerticalPull({ translateY: 400, released: false, velocityY: 3000 });
    onVerticalPull({
      translateY: PULL_CLOSE_DISTANCE - 20,
      released: true,
      velocityY: 0,
    });
    expect(onClose).not.toHaveBeenCalled();

    onVerticalPull({ translateY: PULL_CLOSE_DISTANCE, released: true, velocityY: 0 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockActions.remove).not.toHaveBeenCalled();
  });

  test('says "N of M" and opens the next photo on a swipe; the photo in view follows the caller', async () => {
    const view = await open({ photos: sequence, photo: sequence[0], onChange });
    expect(screen.getByTestId('photo-viewer-position')).toHaveTextContent('1 of 3');
    expect(screen.getByLabelText('Photo 1 of 3')).toBeTruthy();

    await act(async () => zoomHooks.__gallery().props.onIndexChange(2));
    expect(onChange).toHaveBeenCalledWith(sequence[2]);

    await view.rerender(
      <PhotoViewer
        photo={sequence[2]}
        photos={sequence}
        onChange={onChange}
        stops={mockStops.data}
        actions={mockActions}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId('photo-viewer-position')).toHaveTextContent('3 of 3');
    // The detail block is the open photo's, not the first one's.
    expect(screen.getByTestId('photo-viewer-place')).toBeTruthy();
  });

  test('without `onChange`, or with a photo that is not among them, it shows the one photo alone', async () => {
    await open({ photos: sequence, photo: sequence[0] });
    expect(zoomHooks.__gallery().props.data).toHaveLength(1);
    await screen.unmount();

    await open({ photos: sequence, photo: uploaded, onChange });
    expect(zoomHooks.__gallery().props.data).toHaveLength(1);
    expect(screen.queryByTestId('photo-viewer-position')).toBeNull();
  });

  test('a gesture never reaches a write: nothing is filed, retried or deleted by moving around', async () => {
    await open({ photos: sequence, photo: sequence[0], onChange });
    const props = zoomHooks.__gallery().props;
    await act(async () => props.onIndexChange(1));
    props.onVerticalPull({ translateY: 300, released: true, velocityY: 0 });

    for (const write of Object.values(mockActions)) expect(write).not.toHaveBeenCalled();
  });

  test('with reduced motion the snap back does not animate, the view does not fade in', async () => {
    useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
    await open();
    expect(zoomHooks.__gallery().props.snapTimingConfig).toEqual({ duration: 0 });
    expect(screen.getByTestId('photo-viewer-modal').props.animationType).toBe('none');
    expect(screen.getByTestId('photo-viewer-image').props.transition).toBe(0);
  });

  test('with motion allowed the view fades in and the full image cross-fades', async () => {
    await open();
    expect(screen.getByTestId('photo-viewer-modal').props.animationType).toBe('fade');
    expect(screen.getByTestId('photo-viewer-image').props.transition).toBeGreaterThan(0);
  });
});

describe('<PhotoViewer> - progressive loading and the honest error', () => {
  test('draws the thumbnail first and the full image over it, the full one named', async () => {
    await open();
    expect(screen.getByTestId('photo-viewer-thumbnail', hidden).props.source).toEqual({
      uri: THUMB,
    });
    const full = screen.getByTestId('photo-viewer-image');
    expect(full.props.source).toEqual({ uri: FULL });
    expect(full.props.accessibilityLabel).toMatch(/Roma/);
    expect(full.props.contentFit).toBe('contain');
  });

  test('drops the thumbnail once the full image is on screen', async () => {
    await open();
    await act(async () => {
      fireEvent(screen.getByTestId('photo-viewer-image'), 'display');
    });
    expect(screen.queryByTestId('photo-viewer-thumbnail', hidden)).toBeNull();
    expect(screen.getByTestId('photo-viewer-image')).toBeTruthy();
  });

  test('a full image that will not draw says so, and the thumbnail does not pose as the photo', async () => {
    await open();
    await act(async () => {
      fireEvent(screen.getByTestId('photo-viewer-image'), 'error', { error: 'decode' });
    });
    expect(screen.getByTestId('photo-viewer-image-unavailable')).toHaveTextContent(
      'This photo couldn’t be shown. Its file on this device may be damaged.',
    );
    expect(screen.queryByTestId('photo-viewer-image')).toBeNull();
    expect(screen.queryByTestId('photo-viewer-thumbnail', hidden)).toBeNull();
    // The rest of the view still works: the traveller can close and delete it.
    expect(screen.getByLabelText('Delete this photo')).toBeTruthy();
    expect(screen.getByLabelText('Close photo')).toBeTruthy();
  });

  test('a photo with no file on this device says where it is, and draws no image', async () => {
    await open({ photo: photo('55555555', { local_file_uri: null }) });
    expect(screen.getByText('This photo isn’t stored on this device.')).toBeTruthy();
    expect(screen.queryByTestId('photo-viewer-image')).toBeNull();
    expect(screen.queryByTestId('photo-viewer-ambient-image', hidden)).toBeNull();
  });

  test('a write that fails is said in the view, in its own region (photo-viewer-error)', async () => {
    mockActions.refile.mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    await open();
    await fireEvent.press(screen.getByTestId('photo-file-city:101'));
    expect(screen.getByTestId('photo-viewer-error')).toHaveTextContent(
      'That change couldn’t be saved on this device. Please try again.',
    );
  });

  test('draws the traveller’s own file only: no link, no signed address', async () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'src', 'components', 'trip', 'photo-viewer.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/https?:\/\/(?!docs\.expo)/);
    expect(source).not.toMatch(/\bfetch\(|getSignedUrl|signedUrl|Linking/);
    await open();
    for (const id of ['photo-viewer-image', 'photo-viewer-thumbnail']) {
      expect(screen.getByTestId(id, hidden).props.source.uri).toMatch(/^file:\/\//);
    }
  });
});

describe('<PhotoViewer> - pictured controls with no capability (Q-11)', () => {
  const pictured = [
    ['coming-soon-share', 'Share', 'Sharing is coming soon'],
    ['coming-soon-more', 'More', 'More actions is coming soon'],
    ['photo-viewer-caption', 'Add a caption', 'Captions is coming soon'],
    ['photo-viewer-share', 'Share', 'Sharing is coming soon'],
    ['photo-viewer-save-copy', 'Save copy', 'Saving a copy is coming soon'],
  ] as const;

  test.each(pictured)('%s is a real, focusable button named "%s"', async (id, name) => {
    await open();
    const control = screen.getByTestId(id);
    expect(control.props.accessibilityRole).toBe('button');
    expect(control.props.accessibilityLabel).toBe(name);
    expect(control.props.accessibilityHint).toBe('Not available yet');
    expect(control.props.accessibilityState).toMatchObject({ disabled: false });
  });

  test.each(pictured)(
    '%s shows one toast and does nothing else',
    async (id, _name, message) => {
      await open();
      await fireEvent.press(screen.getByTestId(id));

      expect(mockToast.show).toHaveBeenCalledTimes(1);
      const request = mockToast.show.mock.calls[0]![0] as { id: string };
      expect(request.id).toBe('coming-soon');
      await render(
        (
          mockToast.show.mock.calls[0]![0] as {
            component: (p: Record<string, unknown>) => React.ReactElement;
          }
        ).component({
          id: 'coming-soon',
          index: 0,
          total: { value: 1 },
          heights: { value: {} },
          show: jest.fn(),
          hide: jest.fn(),
        }),
      );
      expect(screen.getAllByText(message).length).toBeGreaterThan(0);
      for (const write of Object.values(mockActions))
        expect(write).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  test('the caption row stores nothing: it is a prompt, with no input and no invented caption', async () => {
    await open();
    const row = screen.getByTestId('photo-viewer-caption');
    expect(within(row).getByText('Add a caption')).toBeTruthy();
    expect(within(row).getByTestId(glyphId('pencil'), hidden)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/./)).toBeNull();
    expect(screen.queryByText(/Pena Palace|clock tower/i)).toBeNull();
  });

  test('nothing offers to publish or set visibility; the viewer says it is private', async () => {
    await open();
    expect(screen.queryByLabelText(/public|visibility/i)).toBeNull();
    expect(screen.getByText('Private — only you can see your photos.')).toBeTruthy();
  });

  test('a photo the traveller chose public says so, and that for now only they can see it (spec 006)', async () => {
    await open({ photo: photo('dddddddd', { is_public: true }) });

    expect(
      screen.getByText('Public — for now only you can see this photo.'),
    ).toBeTruthy();
    expect(screen.queryByText('Private — only you can see your photos.')).toBeNull();
    expect(screen.queryByLabelText(/public|visibility/i)).toBeNull();
  });

  test('the pictured controls reach no router, store or network', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'src', 'components', 'trip', 'photo-viewer.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(
      /expo-router|from '@\/db\/(?!repositories\/(photos|stops)')|@\/lib\/api|axios|expo-sharing|expo-media-library/,
    );
  });
});

describe('<PhotoViewer> - Delete, retry and filing keep their behaviour', () => {
  const confirmDeletes = () =>
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });

  test('Delete is the pictured tile in danger ink, asks first, then removes and closes', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await open();
    const remove = screen.getByLabelText('Delete this photo');
    expect(remove).toBe(screen.getByTestId('photo-viewer-delete'));
    expect(within(remove).getByTestId(glyphId('trash'), hidden)).toBeTruthy();
    expect(within(remove).getByText('Delete').props.className).toContain('text-danger');

    await fireEvent.press(remove);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(mockActions.remove).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => buttons.find((b) => b.style === 'destructive')?.onPress?.());
    expect(mockActions.remove).toHaveBeenCalledWith(uploaded.id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('a delete that cannot be saved keeps the view open and says so', async () => {
    confirmDeletes();
    mockActions.remove.mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    await open();
    await fireEvent.press(screen.getByLabelText('Delete this photo'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('photo-viewer-error')).toHaveTextContent(
      /couldn’t be saved/,
    );
  });

  test('a failed upload can be retried, and refiling goes through the local write', async () => {
    await open({ photo: failed });
    await fireEvent.press(screen.getByLabelText('Try uploading this photo again'));
    expect(mockActions.retryUpload).toHaveBeenCalledWith(failed.id);

    await fireEvent.press(screen.getByTestId('photo-file-city:101'));
    expect(mockActions.refile).toHaveBeenCalledWith(failed.id, 101);
  });
});

describe('<PhotoViewer> - dark, contrast and text scales', () => {
  test.each(['dark', 'light-contrast', 'dark-contrast'] as const)(
    'in %s the ground, ambient, bar and sheet stay on tokens (no colour literal is drawn)',
    async (theme) => {
      useAppearance.mockReturnValue(appearanceOf(theme));
      await open();
      const source = readFileSync(
        join(__dirname, '..', '..', 'src', 'components', 'trip', 'photo-viewer.tsx'),
        'utf8',
      );
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(screen.getByLabelText('Close photo')).toBeTruthy();
      expect(String(screen.getByTestId('photo-viewer').props.className)).toContain(
        'bg-toast-surface',
      );
    },
  );

  test.each([1.5, 2])(
    'at text scale %s the tiles grow and no text is capped',
    async (scale) => {
      useFontScale.mockReturnValue(scale);
      useAppearance.mockReturnValue(appearance({ fontScale: scale }));
      await open();

      expect(styleOf(screen.getByTestId('photo-viewer-share')).minHeight).toBe(
        64 * scale,
      );
      expect(styleOf(screen.getByTestId('photo-viewer-caption')).minHeight).toBe(
        52 * scale,
      );
      for (const id of ['photo-viewer-place']) {
        const node = screen.getByTestId(id);
        expect(node.props.numberOfLines).toBeUndefined();
        expect(node.props.maxFontSizeMultiplier).toBeUndefined();
      }
      // Every control is still there to reach: the sheet scrolls instead of clipping.
      expect(screen.getByTestId('photo-viewer-delete')).toBeTruthy();
      expect(screen.getByTestId('photo-file-none')).toBeTruthy();
    },
  );

  test('the glass controls keep their 44 dp disc at any text size', async () => {
    useFontScale.mockReturnValue(2);
    useAppearance.mockReturnValue(appearance({ fontScale: 2 }));
    await open();
    expect(styleOf(screen.getByLabelText('Close photo')).width).toBe(44);
    expect(styleOf(screen.getByTestId('coming-soon-share')).width).toBe(44);
  });
});
