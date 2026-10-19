/**
 * T543 - `TripHero` (contract C5-20; spec FR-037, FR-007, FR-008, FR-076; research D5-10,
 * D5-12): the trip's picture, full bleed, with its title anchored to the bottom and growing
 * upward to two lines, the country with its flag and the dates above it, and the two scrims
 * that keep white text at 4.5:1 over any photograph.
 *
 * What Jest can say: the structure (which node holds what), the numbers it was given, that no
 * ancestor of the title has a fixed height (so large text reflows instead of clipping), the
 * accessibility of the heading and the hidden decoration. How it LOOKS is a phone's to say.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, type StyleProp } from 'react-native';

import { TripHero } from '@/components/trip/trip-hero';
import type { TripCover } from '@/features/trips/trip-cover';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
// A View that carries every prop, so a test reads `source`, `recyclingKey` and fires `error`.
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});

const photo: TripCover = {
  kind: 'photo',
  photoId: 'photo-1',
  thumbnailUri: 'file:///thumbs/photo-1.jpg',
};
const typographic: TripCover = { kind: 'typographic', initial: 'P', status: 'active' };
const portugal = { iso2: 'PT', name: 'Portugal' };
const range = { start: '2026-10-12', end: '2026-10-19' };

const hidden = { includeHiddenElements: true };

function hero(props: Partial<React.ComponentProps<typeof TripHero>> = {}) {
  return (
    <TripHero
      title="Portugal Road Trip"
      cover={photo}
      tripId="trip-1"
      country={portugal}
      dateRange={range}
      {...props}
    />
  );
}

const flat = (style: StyleProp<object>) =>
  (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;

type Json = { props?: { testID?: unknown }; children?: unknown } | string | null;

/** Every testID of the rendered tree, in drawing order (later is drawn above). */
function testIdsInOrder(node: Json | Json[]): string[] {
  if (node === null || typeof node === 'string') return [];
  if (Array.isArray(node)) return node.flatMap(testIdsInOrder);
  const own = typeof node.props?.testID === 'string' ? [node.props.testID] : [];
  return [...own, ...testIdsInOrder((node.children as Json[] | null) ?? [])];
}

describe('<TripHero> the title', () => {
  test('keeps testID "trip-title" and says the exact words of the trip', async () => {
    await render(hero());
    expect(screen.getByTestId('trip-title')).toHaveTextContent('Portugal Road Trip');
  });

  test('is the heading of the screen', async () => {
    await render(hero());
    expect(screen.getByTestId('trip-title').props.accessibilityRole).toBe('header');
  });

  test('clamps to two lines and is not capped: it is the largest text on the screen and must scale', async () => {
    await render(hero());
    const title = screen.getByTestId('trip-title');
    expect(title.props.numberOfLines).toBe(2);
    expect(title.props.maxFontSizeMultiplier).toBeUndefined();
  });

  test('is white on the photograph: opaque, never an alpha white (FR-007)', async () => {
    await render(hero());
    expect(String(screen.getByTestId('trip-title').props.className)).toContain(
      'text-on-photo',
    );
  });

  test('sits inside the caption scrim, so the band is under every line of it', async () => {
    await render(hero());
    const caption = within(screen.getByTestId('trip-hero-caption'));
    expect(caption.getByTestId('trip-title')).toBeTruthy();
    expect(caption.getByTestId('trip-hero-eyebrow')).toBeTruthy();
  });

  test('anchors to the bottom and grows upward: the hero is a bottom-aligned column of minimums', async () => {
    await render(hero());
    const root = flat(screen.getByTestId('trip-hero').props.style);
    expect(root.justifyContent).toBe('flex-end');
    expect(root.minHeight).toBe(236);
    // 100 dp of room for the status bar and the Back control above the text.
    expect(root.paddingTop).toBe(100);
  });

  test('the caption keeps 36 dp (28 of overlap and 8 of air) under the text', async () => {
    await render(hero());
    expect(flat(screen.getByTestId('trip-hero-caption-block').props.style)).toMatchObject(
      {
        paddingBottom: 36,
      },
    );
  });

  test('no node between the title and the hero has a fixed height, so large text reflows (FR-037, FR-074)', async () => {
    await render(
      hero({ title: 'A very long trip title that needs its two lines at any size' }),
    );
    const root = screen.getByTestId('trip-hero');
    let node = screen.getByTestId('trip-title').parent;
    let steps = 0;
    while (node && node !== root.parent) {
      const style = flat(node.props.style);
      expect(style.height).toBeUndefined();
      expect(style.maxHeight).toBeUndefined();
      node = node.parent;
      steps += 1;
    }
    expect(steps).toBeGreaterThan(1);
  });
});

describe('<TripHero> the eyebrow', () => {
  test('says the country and the dates, with the flag beside it', async () => {
    await render(hero());
    const eyebrow = screen.getByTestId('trip-hero-eyebrow');
    expect(eyebrow).toHaveTextContent(/Portugal · 12 Oct – 19 Oct 2026/);
    expect(screen.getByTestId('trip-hero-flag', hidden)).toBeTruthy();
  });

  test('the flag is decorative: the country name is beside it', async () => {
    await render(hero());
    const flag = screen.getByTestId('trip-hero-flag', hidden);
    // FlagChip hides itself from assistive technology.
    expect(
      flag.props.accessibilityElementsHidden ??
        flag.parent?.props.accessibilityElementsHidden,
    ).toBe(true);
  });

  test('is white on the photograph and capped at 1.3 like every eyebrow', async () => {
    await render(hero());
    const eyebrow = screen.getByTestId('trip-hero-eyebrow');
    expect(String(eyebrow.props.className)).toContain('text-on-photo');
    expect(eyebrow.props.maxFontSizeMultiplier).toBe(1.3);
  });

  test('with no country yet it says only the dates, and without a flag', async () => {
    await render(hero({ country: null }));
    expect(screen.getByTestId('trip-hero-eyebrow')).toHaveTextContent(
      /^12 Oct – 19 Oct 2026$/,
    );
    expect(screen.queryByTestId('trip-hero-flag', hidden)).toBeNull();
  });

  test('with no dates yet it says only the country', async () => {
    await render(hero({ dateRange: null }));
    expect(screen.getByTestId('trip-hero-eyebrow')).toHaveTextContent(/^Portugal$/);
  });

  test('with neither (a trip with no stops) there is no eyebrow at all, only the title', async () => {
    await render(hero({ country: null, dateRange: null }));
    expect(screen.queryByTestId('trip-hero-eyebrow')).toBeNull();
    expect(screen.getByTestId('trip-title')).toBeTruthy();
  });

  test('a country without a code shows the name and no flag', async () => {
    await render(hero({ country: { iso2: null, name: 'Atlantis' } }));
    expect(screen.getByTestId('trip-hero-eyebrow')).toHaveTextContent(/Atlantis/);
    expect(screen.queryByTestId('trip-hero-flag', hidden)).toBeNull();
  });
});

describe('<TripHero> the scrims (FR-007: a fixed band under every line of text)', () => {
  test('draws the top scrim over the status-bar zone and the caption scrim under the text', async () => {
    await render(hero());
    expect(screen.getByTestId('trip-hero-scrim-top', hidden)).toBeTruthy();
    expect(screen.getByTestId('trip-hero-caption-ramp', hidden)).toBeTruthy();
    expect(screen.getByTestId('trip-hero-caption-block')).toBeTruthy();
  });

  test('the scrims draw above the picture and below the text, and take no touches', async () => {
    await render(hero());
    const top = screen.getByTestId('trip-hero-scrim-top', hidden);
    expect(top.props.pointerEvents).toBe('none');
    const order = testIdsInOrder(screen.toJSON());
    expect(order.indexOf('trip-hero-image')).toBeLessThan(
      order.indexOf('trip-hero-scrim-top'),
    );
    expect(order.indexOf('trip-hero-scrim-top')).toBeLessThan(
      order.indexOf('trip-hero-caption'),
    );
    expect(order.indexOf('trip-hero-caption')).toBeLessThan(order.indexOf('trip-title'));
  });
});

describe('<TripHero> the cover', () => {
  test('a photograph is the thumbnail, cover-fitted, recycled by photo and hidden from assistive technology', async () => {
    await render(hero());
    const image = screen.getByTestId('trip-hero-photo', hidden);
    expect(image.props.source).toEqual({ uri: 'file:///thumbs/photo-1.jpg' });
    expect(image.props.recyclingKey).toBe('photo-1');
    expect(image.props.contentFit).toBe('cover');
    expect(
      screen.getByTestId('trip-hero-image', hidden).props.accessibilityElementsHidden,
    ).toBe(true);
    expect(screen.queryByTestId('trip-hero-generated', hidden)).toBeNull();
  });

  test('fades the photograph in (D5-12) rather than popping', async () => {
    await render(hero());
    expect(
      screen.getByTestId('trip-hero-photo', hidden).props.transition,
    ).toBeGreaterThan(0);
  });

  test("with no photograph it is the generated cover with the trip's palette and country (FR-008)", async () => {
    await render(hero({ cover: typographic }));
    expect(screen.getByTestId('trip-hero-generated', hidden)).toBeTruthy();
    expect(screen.queryByTestId('trip-hero-photo', hidden)).toBeNull();
    // The country's code is the big ghost glyph, the flag chip is in the eyebrow.
    expect(screen.getByTestId('trip-hero-generated-glyph', hidden)).toHaveTextContent(
      'PT',
    );
  });

  test('a trip with no country shows the first letter of its title on the generated cover', async () => {
    await render(
      hero({
        cover: { kind: 'typographic', initial: 'R', status: 'planning' },
        country: null,
        title: 'Road Trip',
      }),
    );
    expect(screen.getByTestId('trip-hero-generated-glyph', hidden)).toHaveTextContent(
      'R',
    );
  });

  test('a photograph that will not draw falls back to the generated cover without a layout change', async () => {
    await render(hero());
    await fireEvent(screen.getByTestId('trip-hero-photo', hidden), 'error', {
      error: 'x',
    });
    expect(screen.getByTestId('trip-hero-generated', hidden)).toBeTruthy();
    expect(screen.queryByTestId('trip-hero-photo', hidden)).toBeNull();
    // The scrims and the text are untouched.
    expect(screen.getByTestId('trip-title')).toHaveTextContent('Portugal Road Trip');
  });

  test('forwards the parallax style to the picture, not to the text', async () => {
    const parallax = { transform: [{ translateY: 12 }, { scale: 1 }] };
    await render(hero({ imageStyle: parallax }));
    expect(flat(screen.getByTestId('trip-hero-image', hidden).props.style)).toMatchObject(
      {
        transform: [{ translateY: 12 }, { scale: 1 }],
      },
    );
    expect(
      flat(screen.getByTestId('trip-hero-caption').props.style).transform,
    ).toBeUndefined();
  });

  test('the picture is taller than the hero so the parallax never shows an edge', async () => {
    await render(hero());
    const style = flat(screen.getByTestId('trip-hero-image', hidden).props.style);
    // Pinned to the top and the sides and extended below by the parallax travel.
    expect(style.position).toBe('absolute');
    expect(style.top).toBeDefined();
    expect(style.bottom).toBeLessThan(0);
  });
});

describe('<TripHero> reports its height so the bar knows when the hero has gone', () => {
  test('calls onHeight with the laid-out height', async () => {
    const onHeight = jest.fn();
    await render(hero({ onHeight }));
    await fireEvent(screen.getByTestId('trip-hero'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 301 } },
    });
    expect(onHeight).toHaveBeenCalledWith(301);
  });
});

describe('<TripHero> at the largest text size (FR-037)', () => {
  test('still draws the whole title: the hero grows around it instead of cutting it', async () => {
    const dimensions = jest.requireActual('react-native').Dimensions;
    jest
      .spyOn(dimensions, 'get')
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 2 });
    await render(hero({ title: 'Portugal Road Trip' }));
    const title = screen.getByTestId('trip-title');
    expect(title).toHaveTextContent('Portugal Road Trip');
    // Two lines is the clamp; there is no scale at which it drops to one or is hidden.
    expect(title.props.numberOfLines).toBe(2);
    expect(title.props.accessibilityElementsHidden).not.toBe(true);
    jest.restoreAllMocks();
  });
});
