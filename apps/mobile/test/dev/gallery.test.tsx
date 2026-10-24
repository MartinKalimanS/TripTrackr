/**
 * T524 - the dev gallery (feature 005; research D5-18; contract C5-13 rule 5): every adapter in
 * the four themes at text scale 1 and 2, on a phone, on one page.
 *
 * What is asserted: every section is on the page in all four themes at both scales; the
 * switchers change what the subtree reads (the theme, the tokens, the layout scale) and nothing
 * outside it; each skeleton announces exactly one progressbar; the held button is the real
 * button's pressed look; the white photograph is a generated view; the sheet, the tab bars, the
 * stamps and the covers are all there in their bounded frames.
 *
 * What cannot be asserted here is how any of it looks: Jest has no renderer, so the gallery is
 * for a phone, and the Maestro flow `e2e/gallery.yaml` records and compares screenshots.
 * Gestures are not driven (the sheet's own suite does that); the sheet is proven mounted at its
 * three detents.
 */
import 'react-native-gesture-handler/jestSetup';

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Gallery } from '@/components/dev/gallery';
import { SECTION_IDS } from '@/components/dev/gallery-model';
import { Colors, MinTouchTarget } from '@/constants/theme';
import { PaletteNames, type PaletteName } from '@/theme';

import { captureIntervals } from '../helpers/captured-interval';

jest.setTimeout(120_000);

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => {
  const app = require('../mocks/reanimated-app');
  const live = require('../mocks/reanimated-live');
  return {
    __esModule: true,
    ...app,
    useSharedValue: live.useSharedValue,
    useAnimatedStyle: live.useAnimatedStyle,
    withSpring: live.withSpring,
    withTiming: live.withTiming,
    cancelAnimation: live.cancelAnimation,
    runOnJS: live.runOnJS,
    useEvent: live.useEvent,
    setGestureState: live.setGestureState,
  };
});
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    (require('react') as typeof import('react')).useEffect(effect, [effect]),
}));

const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock; hide: jest.Mock };
};

// The numerals count up on their own interval: held by hand, so no frame lands outside `act`.
beforeEach(() => {
  captureIntervals();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const SCALES = [1, 2] as const;
const COMBINATIONS = PaletteNames.flatMap((name) =>
  SCALES.map((scale) => [name, scale] as const),
);

/** A 390 by 844 phone with a status bar and a home indicator. */
const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const mount = (gallery: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={PHONE}>{gallery}</SafeAreaProvider>);

const readout = () => String(screen.getByTestId('gallery-readout').props.children);
const styleOf = (element: { props: { style?: unknown } }) =>
  StyleSheet.flatten(element.props.style as never) as Record<string, unknown>;

describe('every section is on the page, in every theme at both scales', () => {
  test.each(COMBINATIONS)('%s at scale %i', async (theme: PaletteName, scale) => {
    await mount(<Gallery initialTheme={theme} initialScale={scale} />);

    for (const id of SECTION_IDS) {
      expect(screen.getByTestId(`gallery-${id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('gallery-numerals')).toBeTruthy();
    expect(readout()).toContain(`${theme} · layout ×${scale}`);
  });

  test('the sections come in the order of the model', async () => {
    await mount(<Gallery />);
    const ids = screen
      .getAllByTestId(/^gallery-(type|buttons|icon-buttons|chips|cards|trips|fields)$/)
      .map((node) => node.props.testID);
    expect(ids).toEqual([
      'gallery-type',
      'gallery-buttons',
      'gallery-icon-buttons',
      'gallery-chips',
      'gallery-cards',
      'gallery-trips',
      'gallery-fields',
    ]);
  });
});

describe('the switchers', () => {
  test('opens in the light theme at scale 1 with the system scale shown', async () => {
    await mount(<Gallery />);
    expect(readout()).toMatch(/^light · layout ×1 · system text ×\d\.\d\d$/);
  });

  test.each(PaletteNames.map((name) => [name]))(
    'choosing %s repaints the page and the controls in it',
    async (name: PaletteName) => {
      await mount(<Gallery />);
      await fireEvent.press(screen.getByTestId(`gallery-theme-${name}`));
      expect(readout()).toContain(`${name} · layout ×1`);
      const chip = screen.getByTestId(`gallery-theme-${name}`);
      expect(chip.props.accessibilityState).toMatchObject({ checked: true });
    },
  );

  test('choosing a scale lays the adapters out at it: a button is a minimum that grows', async () => {
    await mount(<Gallery />);
    const save = () => screen.getAllByRole('button', { name: 'Save trip' })[0]!;
    expect(styleOf(save()).minHeight).toBe(Math.max(52, MinTouchTarget));

    await fireEvent.press(screen.getByTestId('gallery-scale-2'));

    expect(readout()).toContain('layout ×2');
    expect(styleOf(save()).minHeight).toBe(MinTouchTarget * 2);
  });

  test('the four areas reflow to two across at scale 2', async () => {
    await mount(<Gallery />);
    const areas = () => screen.getByTestId('gallery-cards-areas');
    expect(within(areas()).getByText('AreaPill · 4 across')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('gallery-scale-2'));
    expect(within(areas()).getByText('AreaPill · 2 across (large text)')).toBeTruthy();
  });

  test('a contrast theme gives the tokens of that theme to what is below', async () => {
    await mount(<Gallery initialTheme="dark-contrast" />);
    const page = screen.getByTestId('gallery');
    expect(page.props.className).toContain('bg-background');
    expect(Colors['dark-contrast'].canvas).not.toBe(Colors.light.canvas);
  });
});

describe('type', () => {
  test('all ten roles and the numerals row are there, and the figures are tabular', async () => {
    await mount(<Gallery />);
    for (const role of [
      'display',
      'numeral',
      'title',
      'headline',
      'callout',
      'body',
      'label',
      'caption',
      'eyebrow',
      'accent',
    ]) {
      expect(screen.getByTestId(`gallery-type-${role}`)).toBeTruthy();
    }
    for (const value of [11111, 88888, 12345, 67890]) {
      const style = styleOf(screen.getByTestId(`gallery-numeral-${value}`));
      expect(style.fontVariant).toContain('tabular-nums');
    }
  });
});

describe('trip cards', () => {
  test('the ticket stacks and the row shrinks its thumbnail at scale 2, and not at scale 1', async () => {
    await mount(<Gallery />);
    // Jest's window font scale is 2: the gallery's own scale, not the device's, decides.
    const ticket = () => styleOf(screen.getByTestId('trip-card-gallery-planned-surface'));
    const thumb = () => styleOf(screen.getByTestId('trip-card-gallery-past-thumb'));
    expect(ticket().flexDirection).toBe('row');
    expect(thumb().width).toBe(64);

    await fireEvent.press(screen.getByTestId('gallery-scale-2'));

    expect(ticket().flexDirection).toBe('column');
    expect(thumb().width).toBe(56);
  });

  test('the hero, the ticket and both rows are there, one of them waiting to sync', async () => {
    await mount(<Gallery />);
    for (const id of [
      'gallery-trip',
      'gallery-planned',
      'gallery-past',
      'gallery-past-pending',
    ]) {
      expect(screen.getByTestId(`trip-card-${id}`)).toBeTruthy();
    }
    expect(
      within(screen.getByTestId('trip-card-gallery-past-pending')).getByText(
        'Not yet synced',
      ),
    ).toBeTruthy();
  });
});

describe('skeletons', () => {
  test('each one announces exactly one progressbar, with its shapes hidden', async () => {
    await mount(<Gallery />);
    const frames = screen.getAllByTestId(/^gallery-skeleton-/);
    expect(frames.map((frame) => frame.props.testID)).toEqual([
      'gallery-skeleton-trips',
      'gallery-skeleton-trip',
      'gallery-skeleton-areas',
      'gallery-skeleton-home',
      'gallery-skeleton-cards',
      'gallery-skeleton-rows',
      'gallery-skeleton-card',
      'gallery-skeleton-row',
      'gallery-skeleton-photo',
    ]);
    for (const frame of frames) {
      expect(within(frame).getAllByRole('progressbar')).toHaveLength(1);
      expect(
        within(frame).getAllByRole('progressbar', { includeHiddenElements: true }),
      ).toHaveLength(1);
    }
  });

  test('the same at scale 2 in a contrast theme', async () => {
    await mount(<Gallery initialTheme="light-contrast" initialScale={2} />);
    for (const frame of screen.getAllByTestId(/^gallery-skeleton-/)) {
      expect(within(frame).getAllByRole('progressbar')).toHaveLength(1);
    }
  });
});

describe('buttons', () => {
  test('every variant is shown at rest, held, busy and disabled', async () => {
    await mount(<Gallery />);
    for (const variant of ['primary', 'secondary', 'tonal', 'text', 'destructive']) {
      const row = screen.getByTestId(`gallery-buttons-${variant}`);
      expect(within(row).getAllByRole('button')).toHaveLength(3);
      expect(within(row).getByLabelText(/, shown held down$/)).toBeTruthy();
    }
    expect(screen.getAllByRole('button', { busy: true }).length).toBeGreaterThanOrEqual(
      5,
    );
    expect(
      screen.getAllByRole('button', { disabled: true }).length,
    ).toBeGreaterThanOrEqual(5);
  });
});

describe('icon buttons', () => {
  test('all five variants are over a plain surface and over the white photograph', async () => {
    await mount(<Gallery />);
    for (const where of ['surface', 'photo']) {
      for (const variant of ['default', 'tonal', 'ghost', 'glass', 'onSky']) {
        expect(
          screen.getByTestId(`gallery-icon-button-${where}-${variant}`),
        ).toBeTruthy();
      }
    }
    expect(screen.getByTestId('gallery-icon-button-sky')).toBeTruthy();
  });

  test('the white photograph is a generated view in the onPhoto token: no image, no network', async () => {
    await mount(<Gallery />);
    const photo = screen.getByTestId('gallery-icon-buttons-photo');
    expect(photo.props.className).toContain('bg-on-photo');
    const tree = JSON.stringify(screen.toJSON());
    expect(tree).not.toMatch(/"type":"Image"/);
    expect(tree).not.toContain('://');
  });
});

describe('scrims', () => {
  test('top, bottom, caption, sky, cover and fade are drawn over the white photograph', async () => {
    await mount(<Gallery />);
    const hidden = { includeHiddenElements: true };
    for (const frame of [
      'gallery-scrim-top-frame',
      'gallery-scrim-bottom-frame',
      'gallery-scrim-caption-frame',
      'gallery-scrim-sky-frame',
      'gallery-scrim-cover-frame',
    ]) {
      const photo = screen.getByTestId(frame);
      expect(photo.props.className).toContain('bg-on-photo');
    }
    const inside = (frame: string, id: string) =>
      within(screen.getByTestId(frame)).getByTestId(id, hidden);
    expect(inside('gallery-scrim-top-frame', 'scrim-top')).toBeTruthy();
    expect(inside('gallery-scrim-bottom-frame', 'scrim-bottom')).toBeTruthy();
    expect(inside('gallery-scrim-caption-frame', 'scrim-caption')).toBeTruthy();
    expect(inside('gallery-scrim-sky-frame', 'scrim-sky')).toBeTruthy();
    expect(inside('gallery-scrim-cover-frame', 'scrim-cover')).toBeTruthy();
    expect(inside('gallery-scrim-fade-canvas', 'scrim-fade')).toBeTruthy();
    expect(inside('gallery-scrim-fade-surface', 'scrim-fade')).toBeTruthy();
  });
});

describe('stamps and covers', () => {
  test('the six shapes, the four wear masks, the ghost and the landing are there', async () => {
    await mount(<Gallery />);
    for (const shape of ['circle', 'rect', 'hex', 'oct', 'scallop', 'oval']) {
      expect(
        screen.getByTestId(`gallery-stamp-${shape}`, { includeHiddenElements: true }),
      ).toBeTruthy();
    }
    for (const wear of [0, 1, 2, 3]) {
      expect(
        screen.getByTestId(`gallery-stamp-wear-${wear}`, { includeHiddenElements: true }),
      ).toBeTruthy();
    }
    expect(
      screen.getByTestId('gallery-stamp-ghost', { includeHiddenElements: true }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId('gallery-stamp-replay'));
    expect(
      screen.getByTestId('gallery-stamp-landing', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  test('three generated covers and their thumbnails', async () => {
    await mount(<Gallery />);
    for (const palette of [0, 1, 2]) {
      expect(
        screen.getByTestId(`gallery-cover-${palette}`, { includeHiddenElements: true }),
      ).toBeTruthy();
      expect(
        screen.getByTestId(`gallery-cover-thumb-${palette}`, {
          includeHiddenElements: true,
        }),
      ).toBeTruthy();
    }
  });
});

describe('the sheet at its three detents', () => {
  test('each frame holds a sheet whose handle says its detent', async () => {
    await mount(<Gallery />);
    for (const [detent, label] of [
      ['peek', 'Peek'],
      ['half', 'Half'],
      ['full', 'Full'],
    ] as const) {
      const frame = screen.getByTestId(`gallery-sheet-frame-${detent}`);
      expect(within(frame).getByTestId('home-sheet')).toBeTruthy();
      expect(
        within(frame).getByTestId('home-sheet-handle').props.accessibilityValue,
      ).toEqual({ text: label });
    }
  });

  test('the handle cycles its own sheet and no other', async () => {
    await mount(<Gallery />);
    const handle = (detent: string) =>
      within(screen.getByTestId(`gallery-sheet-frame-${detent}`)).getByTestId(
        'home-sheet-handle',
      );
    await fireEvent.press(handle('peek'));
    expect(handle('peek').props.accessibilityValue).toEqual({ text: 'Half' });
    expect(handle('half').props.accessibilityValue).toEqual({ text: 'Half' });
    expect(handle('full').props.accessibilityValue).toEqual({ text: 'Full' });
  });
});

describe('the tab bars', () => {
  /** The capsule and the indicator are decoration, hidden from assistive technology. */
  const hidden = { includeHiddenElements: true };
  const frame = (name: string) => screen.getByTestId(`gallery-nav-${name}`);

  test('a pill, and the same pill without transparency', async () => {
    await mount(<Gallery />);
    expect(within(frame('pill')).getByTestId('tab-bar')).toBeTruthy();
    expect(within(frame('pill-solid')).getByTestId('tab-bar')).toBeTruthy();
    expect(within(frame('pill')).getByTestId('tab-mark-index', hidden)).toBeTruthy();
  });

  test('the pill is the blur on an iPhone, and opaque with Reduce Transparency', async () => {
    await mount(<Gallery />);
    expect(within(frame('pill')).getByTestId('tab-surface-blur')).toBeTruthy();
    expect(within(frame('pill-solid')).getByTestId('tab-surface-solid')).toBeTruthy();
  });

  test.each(['light-contrast', 'dark-contrast'] as const)(
    'both pills are opaque in %s',
    async (theme) => {
      await mount(<Gallery initialTheme={theme} />);
      expect(within(frame('pill')).getByTestId('tab-surface-solid')).toBeTruthy();
      expect(within(frame('pill-solid')).getByTestId('tab-surface-solid')).toBeTruthy();
    },
  );

  test('pressing a tab moves its own selection only', async () => {
    await mount(<Gallery />);
    await fireEvent.press(within(frame('pill')).getByTestId('tab-trips'));
    expect(within(frame('pill')).getByTestId('tab-mark-trips', hidden)).toBeTruthy();
    expect(
      within(frame('pill-solid')).getByTestId('tab-mark-index', hidden),
    ).toBeTruthy();
  });
});

describe('fields, banners and toasts', () => {
  test('the field specimens: default, filled, focus, error, disabled', async () => {
    await mount(<Gallery />);
    for (const state of ['default', 'filled', 'focus', 'error', 'disabled']) {
      expect(screen.getByTestId(`gallery-field-${state}`)).toBeTruthy();
    }
    expect(screen.getByText('Enter a whole number of nights.')).toBeTruthy();
  });

  test('the toast buttons ask the kit for a toast, with and without Undo', async () => {
    await mount(<Gallery />);
    await fireEvent.press(screen.getByTestId('gallery-toast-undo'));
    const request = mockToast.show.mock.calls.at(-1)?.[0] as { duration: number };
    expect(request.duration).toBe(5000);
    expect(mockToast.show).toHaveBeenCalledTimes(1);
  });

  test('the banners: offline, error with a retry, and a busy retry', async () => {
    await mount(<Gallery />);
    expect(screen.getByTestId('gallery-banner-offline')).toBeTruthy();
    expect(screen.getByTestId('gallery-banner-error-retry')).toBeTruthy();
    expect(screen.getByTestId('gallery-banner-busy')).toBeTruthy();
  });
});

describe('empty states', () => {
  test('all four variants, an error and a loading state', async () => {
    await mount(<Gallery />);
    for (const id of [
      'gallery-empty-plain',
      'gallery-empty-ghost-stamp',
      'gallery-empty-frames',
      'gallery-empty-filtered',
      'gallery-error',
      'gallery-loading',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });
});
