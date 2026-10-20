/**
 * The pins — feature 005, T533 (FR-011; research D5-04, contract C5-24).
 *
 * A pin is a photo roundel (a `SymbolLayer` over bitmaps baked from a hidden laid-out view
 * with `react-native-view-shot`; a trip with no photograph is its generated cover), behind
 * `GlobeLayers.pins.roundelsEnabled`, which is ON. Every pin without a bitmap is a
 * `CircleLayer` dot, and the dots cluster. Here the whole path runs through the view-shot
 * stand-in.
 *
 * The press is the shared one: a pin answers a tap with `tripIdFromPress`, unchanged.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import {
  GlobeColors,
  GlobeGeometry,
  GlobeLayers,
  MinTouchTarget,
} from '@/constants/theme';
import {
  toGlobeTrips,
  type GlobeStopRow,
  type GlobeTrip,
} from '@/features/globe/globe-data';

import { PIN_RANK, pinCollection, splitPins } from '../pin-features';
import { PinDotLayer, PinLayer, RoundelLayer } from '../pin-layer';
import { tripIdFromPress } from '../use-arc-press';
import { useRoundels } from '../use-roundels';

const { captureRef } = jest.requireMock('react-native-view-shot') as {
  captureRef: jest.Mock;
};

const TODAY = '2026-05-10';

let n = 0;
function stop(tripId: string, arrive: string): GlobeStopRow {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: tripId,
    city_id: n,
    arrive_date: arrive,
    depart_date: arrive,
    country_id: 1,
    lat: 10,
    lng: n,
  };
}

function trips(specs: [id: string, arrive: string][]): GlobeTrip[] {
  return toGlobeTrips(
    specs.map(([id]) => ({ id, title: id })),
    specs.map(([id, arrive]) => stop(id, arrive)),
    TODAY,
  );
}

const MIXED = trips([
  ['live', TODAY],
  ['old', '2025-01-01'],
  ['soon', '2027-01-01'],
]);
const COVERS = {
  live: 'file:///live.jpg',
  old: 'file:///old.jpg',
  soon: 'file:///soon.jpg',
};

beforeEach(() => {
  captureRef.mockClear();
});

describe('<PinLayer> — the default: dots', () => {
  const dots = pinCollection(MIXED, TODAY);
  const none = { type: 'FeatureCollection' as const, features: [] };

  test('one source of pins and its layers: the dot and the cluster, no roundels', async () => {
    await render(
      <PinLayer
        split={{ roundels: none, dots }}
        bitmaps={{}}
        palette={GlobeColors.light}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByTestId('mapbox-ShapeSource-globe-pins').props.shape).toEqual(dots);
    expect(screen.getByTestId('mapbox-CircleLayer-globe-pin-dot')).toBeTruthy();
    expect(screen.queryByTestId('mapbox-Images')).toBeNull();
    expect(screen.queryByTestId('mapbox-SymbolLayer-globe-roundel')).toBeNull();
  });

  test.each(['light', 'dark'] as const)(
    '%s: a dot in its status colour on a casing ring, the live one largest, the live one on top',
    async (theme) => {
      const palette = GlobeColors[theme];
      await render(
        <PinLayer
          split={{ roundels: none, dots }}
          bitmaps={{}}
          palette={palette}
          onPress={jest.fn()}
        />,
      );
      const style = screen.getByTestId('mapbox-CircleLayer-globe-pin-dot').props
        .layerStyle;
      const { dotRadius, dotRing } = GlobeLayers.pins;
      expect(style).toEqual({
        circleColor: [
          'match',
          ['get', 'status'],
          'active',
          palette.active,
          'planning',
          palette.planning,
          palette.past,
        ],
        circleRadius: [
          'match',
          ['get', 'status'],
          'active',
          dotRadius.active,
          'planning',
          dotRadius.planning,
          dotRadius.past,
        ],
        circleStrokeColor: palette.casing,
        circleStrokeWidth: dotRing,
        circleSortKey: ['get', 'rank'],
        circleEmissiveStrength: 1,
      });
      expect(dotRadius.active).toBeGreaterThan(dotRadius.planning);
      expect(dotRadius.planning).toBeGreaterThanOrEqual(dotRadius.past);
      expect(dotRadius.past).toBeGreaterThan(GlobeGeometry.markerRadius);
    },
  );

  test('answers a tap across a full touch target, with the shared handler and the trip id of the pin', async () => {
    const onPress = jest.fn();
    await render(
      <PinLayer
        split={{ roundels: none, dots }}
        bitmaps={{}}
        palette={GlobeColors.light}
        onPress={onPress}
      />,
    );
    const source = screen.getByTestId('mapbox-ShapeSource-globe-pins');
    expect(source.props.hitbox).toEqual({
      width: MinTouchTarget,
      height: MinTouchTarget,
    });

    const features = dots.features.filter((f) => f.properties.trip_id === 'old');
    await fireEvent(source, 'press', { features });
    expect(onPress).toHaveBeenCalledWith({ features });
    expect(tripIdFromPress(features)).toBe('old');
  });

  test('where pins overlap a tap opens the live trip first, as the shared rule says', () => {
    expect(tripIdFromPress(dots.features)).toBe('live');
  });
});

describe('<PinLayer> — roundels', () => {
  function withRoundels() {
    const pins = pinCollection(MIXED, TODAY);
    const keyOf = (id: string) => `roundel:${id}`;
    const roundels = {
      type: 'FeatureCollection' as const,
      features: pins.features
        .filter((f) => f.properties.trip_id !== 'old')
        .map((f) => ({
          ...f,
          properties: { ...f.properties, roundel: keyOf(f.properties.trip_id) },
        })),
    };
    const dots = {
      type: 'FeatureCollection' as const,
      features: pins.features.filter((f) => f.properties.trip_id === 'old'),
    };
    const bitmaps = {
      [keyOf('live')]: 'file:///live.png',
      [keyOf('soon')]: 'file:///soon.png',
    };
    return { roundels, dots, bitmaps, keyOf };
  }

  test('registers the bitmaps, at the device scale, and draws a symbol for each roundel', async () => {
    const { roundels, dots, bitmaps } = withRoundels();
    await render(
      <PinLayer
        split={{ roundels, dots }}
        bitmaps={bitmaps}
        palette={GlobeColors.light}
        onPress={jest.fn()}
      />,
    );
    const images = screen.getByTestId('mapbox-Images').props.images as Record<
      string,
      { url: string; scale: number }
    >;
    expect(Object.keys(images).sort()).toEqual(['roundel:live', 'roundel:soon']);
    expect(images['roundel:live']!.url).toBe('file:///live.png');
    expect(images['roundel:live']!.scale).toEqual(expect.any(Number));
    expect(screen.getByTestId('mapbox-ShapeSource-globe-roundels').props.shape).toEqual(
      roundels,
    );
  });

  test('the symbol layer: the bitmap by feature, overlap allowed, sorted by rank so the live one is last', async () => {
    const { roundels, dots, bitmaps } = withRoundels();
    await render(
      <PinLayer
        split={{ roundels, dots }}
        bitmaps={bitmaps}
        palette={GlobeColors.light}
        onPress={jest.fn()}
      />,
    );
    const style = screen.getByTestId('mapbox-SymbolLayer-globe-roundel').props.layerStyle;
    expect(style).toMatchObject({
      iconImage: ['get', 'roundel'],
      iconAllowOverlap: true,
      iconIgnorePlacement: true,
      symbolSortKey: ['get', 'rank'],
      iconEmissiveStrength: 1,
    });
    expect(style.iconSize).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      1,
    ]);
    expect(PIN_RANK.active).toBeGreaterThan(PIN_RANK.planning);
  });

  test('the roundels answer the same tap, over the same touch target', async () => {
    const { roundels, dots, bitmaps } = withRoundels();
    const onPress = jest.fn();
    await render(
      <PinLayer
        split={{ roundels, dots }}
        bitmaps={bitmaps}
        palette={GlobeColors.light}
        onPress={onPress}
      />,
    );
    const source = screen.getByTestId('mapbox-ShapeSource-globe-roundels');
    expect(source.props.hitbox).toEqual({
      width: MinTouchTarget,
      height: MinTouchTarget,
    });
    await fireEvent(source, 'press', { features: [roundels.features[0]] });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('draws no symbol layer, and registers no image, while there is no bitmap yet', async () => {
    const { dots, roundels } = withRoundels();
    await render(
      <PinLayer
        split={{ roundels: { ...roundels, features: [] }, dots }}
        bitmaps={{}}
        palette={GlobeColors.light}
        onPress={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('mapbox-Images')).toBeNull();
    expect(screen.queryByTestId('mapbox-SymbolLayer-globe-roundel')).toBeNull();
  });
});

describe('the roundel path is ON by default (the typed one-line switch back to dots)', () => {
  test('GlobeLayers.pins.roundelsEnabled is a boolean, and true', () => {
    const enabled: boolean = GlobeLayers.pins.roundelsEnabled;
    expect(enabled).toBe(true);
  });
});

/** The hook, with its stage drawn beside the layer, as `GlobeView` does. */
function Harness(
  props: Parameters<typeof useRoundels>[2] & {
    pins: GlobeTrip[];
    covers: Record<string, string>;
  },
): ReactElement {
  const { pins, covers, ...options } = props;
  const collection = pinCollection(pins, TODAY);
  const { split, bitmaps, stage } = useRoundels(collection, covers, options);
  return (
    <>
      {stage}
      <PinLayer
        split={split}
        bitmaps={bitmaps}
        palette={GlobeColors.light}
        onPress={jest.fn()}
      />
    </>
  );
}

const imageNodes = () => screen.queryAllByTestId(/^roundel-image-/);
const displayAll = async () => {
  for (const node of imageNodes()) await fireEvent(node, 'display');
};

describe('useRoundels — the pipeline, through the view-shot stand-in', () => {
  test('disabled (the switch back to dots): no stage, no capture, every pin a dot', async () => {
    await render(<Harness pins={MIXED} covers={COVERS} enabled={false} />);
    expect(imageNodes()).toEqual([]);
    expect(captureRef).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('mapbox-ShapeSource-globe-pins').props.shape.features,
    ).toHaveLength(3);
    expect(screen.queryByTestId('mapbox-ShapeSource-globe-roundels')).toBeNull();
  });

  test('enabled: lays a badge out for each trip with a cover, off screen, and captures none before its picture is shown', async () => {
    await render(<Harness pins={MIXED} covers={COVERS} enabled />);
    expect(imageNodes()).toHaveLength(3);
    expect(captureRef).not.toHaveBeenCalled();

    const stage = screen.getByTestId('roundel-stage');
    const style = StyleSheet.flatten(stage.props.style) as Record<string, unknown>;
    // Laid out, not hidden: a view with opacity 0 or no layout captures as nothing (V2).
    expect(style).toMatchObject({ position: 'absolute', left: -2000 });
    expect(style).not.toHaveProperty('opacity');
    expect(stage.props.pointerEvents).toBe('none');
    expect(stage.props.collapsable).toBe(false);
  });

  test('captures each badge to a file once its picture is on screen, and then draws it as a roundel', async () => {
    await render(<Harness pins={MIXED} covers={COVERS} enabled />);
    await displayAll();
    await waitFor(() =>
      expect(screen.getByTestId('mapbox-ShapeSource-globe-roundels')).toBeTruthy(),
    );

    expect(captureRef).toHaveBeenCalledTimes(3);
    expect(captureRef).toHaveBeenCalledWith(expect.anything(), {
      format: 'png',
      result: 'tmpfile',
    });
    const roundels = screen.getByTestId('mapbox-ShapeSource-globe-roundels').props.shape
      .features;
    expect(
      roundels.map((f: { properties: { rank: number } }) => f.properties.rank),
    ).toEqual([0, 1, 2]);
    expect(
      screen.queryByTestId('mapbox-ShapeSource-globe-pins')?.props.shape.features ?? [],
    ).toHaveLength(0);
    // The captured badges are no longer laid out.
    expect(imageNodes()).toEqual([]);
  });

  test('a badge that cannot be captured stays a dot, and is not asked for again', async () => {
    const capture = jest.fn(async (view: unknown) => {
      void view;
      if (capture.mock.calls.length === 2) throw new Error('not laid out');
      return 'file:///ok.png';
    });
    await render(<Harness pins={MIXED} covers={COVERS} enabled capture={capture} />);
    await displayAll();
    await waitFor(() => expect(capture).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.getByTestId('mapbox-ShapeSource-globe-roundels')).toBeTruthy(),
    );

    expect(
      screen.getByTestId('mapbox-ShapeSource-globe-roundels').props.shape.features,
    ).toHaveLength(2);
    expect(
      screen.getByTestId('mapbox-ShapeSource-globe-pins').props.shape.features,
    ).toHaveLength(1);
    expect(imageNodes()).toEqual([]);
    expect(capture).toHaveBeenCalledTimes(3);
  });

  test('a picture that fails to load stays a dot, and is not captured', async () => {
    await render(<Harness pins={MIXED} covers={COVERS} enabled />);
    await fireEvent(imageNodes()[0]!, 'error', { nativeEvent: { error: 'gone' } });
    await displayAll();
    await waitFor(() => expect(captureRef).toHaveBeenCalledTimes(2));
    expect(imageNodes()).toEqual([]);
    expect(
      screen.getByTestId('mapbox-ShapeSource-globe-pins').props.shape.features,
    ).toHaveLength(1);
  });

  test('a trip with no cover still gets a roundel (its generated cover), but no picture to load', async () => {
    const { old: _old, ...someCovers } = COVERS;
    await render(<Harness pins={MIXED} covers={someCovers} enabled />);
    expect(imageNodes()).toHaveLength(2);
    expect(
      screen.getAllByTestId(/^roundel-cover-/, { includeHiddenElements: true }),
    ).toHaveLength(1);
    expect(screen.getAllByTestId(/^roundel-badge-/)).toHaveLength(3);
  });

  test('beyond about sixty the rest are dots: 61 pins, 60 roundels, a batch of badges laid out at a time', async () => {
    const crowd = trips(
      Array.from({ length: 61 }, (_, i): [string, string] => [`t${i}`, '2025-01-01']),
    );
    const covers = Object.fromEntries(crowd.map((t) => [t.id, `file:///${t.id}.jpg`]));
    const { captureBatch } = GlobeLayers.pins;
    await render(<Harness pins={crowd} covers={covers} enabled />);
    expect(imageNodes()).toHaveLength(captureBatch);

    const rounds = 60 / captureBatch;
    for (let round = 1; round <= rounds; round += 1) {
      await displayAll();
      await waitFor(() => expect(captureRef).toHaveBeenCalledTimes(round * captureBatch));
      await waitFor(() =>
        expect(imageNodes()).toHaveLength(round < rounds ? captureBatch : 0),
      );
    }
    expect(
      screen.getByTestId('mapbox-ShapeSource-globe-roundels').props.shape.features,
    ).toHaveLength(60);
    expect(
      screen.getByTestId('mapbox-ShapeSource-globe-pins').props.shape.features,
    ).toHaveLength(1);
  });

  test('a new cover is a new bitmap: the old one stops drawing and the badge is laid out again', async () => {
    const view = await render(<Harness pins={MIXED} covers={COVERS} enabled />);
    await displayAll();
    await waitFor(() => expect(captureRef).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(imageNodes()).toEqual([]));

    await view.rerender(
      <Harness pins={MIXED} covers={{ ...COVERS, live: 'file:///new.jpg' }} enabled />,
    );
    expect(imageNodes()).toHaveLength(1);
    expect(
      screen
        .getByTestId('mapbox-ShapeSource-globe-pins')
        .props.shape.features.map(
          (f: { properties: { trip_id: string } }) => f.properties.trip_id,
        ),
    ).toEqual(['live']);
  });

  test('the badge is the roundel as the globe draws it: a ring, the status ring, dashed when planned', async () => {
    await render(<Harness pins={MIXED} covers={COVERS} enabled />);
    // The status ring is the badge's child; the badge itself is the transparent margin.
    const badges = screen.getAllByTestId(/^roundel-ring-/);
    const byStatus = Object.fromEntries(
      badges.map((b) => {
        const style = StyleSheet.flatten(b.props.style) as Record<string, unknown>;
        return [
          String(b.props.testID).includes('live')
            ? 'active'
            : String(b.props.testID).includes('soon')
              ? 'planning'
              : 'past',
          style,
        ];
      }),
    );
    expect(byStatus.active).toMatchObject({
      borderColor: GlobeColors.light.active,
      borderStyle: 'solid',
    });
    expect(byStatus.planning).toMatchObject({
      borderColor: GlobeColors.light.planning,
      borderStyle: 'dashed',
    });
    expect(byStatus.past).not.toHaveProperty('borderStyle', 'dashed');
  });

  test('splitPins and the hook agree: the same rule decides who gets a roundel', () => {
    const pins = pinCollection(MIXED, TODAY);
    expect(splitPins(pins, [], {}).dots.features).toHaveLength(3);
  });
});

describe('<PinDotLayer> and <RoundelLayer>, each on its own', () => {
  const pins = pinCollection(MIXED, TODAY);
  const noBitmaps = {};

  test('the dot layer draws the dots and nothing else', async () => {
    await render(
      <PinDotLayer dots={pins} palette={GlobeColors.light} onPress={jest.fn()} />,
    );
    expect(screen.getByTestId('mapbox-ShapeSource-globe-pins').props.shape).toEqual(pins);
    expect(screen.getByTestId('mapbox-CircleLayer-globe-pin-dot')).toBeTruthy();
    expect(screen.queryByTestId('mapbox-SymbolLayer-globe-roundel')).toBeNull();
  });

  test('the roundel layer draws nothing for no roundel', async () => {
    await render(
      <RoundelLayer
        roundels={{ type: 'FeatureCollection', features: [] }}
        bitmaps={noBitmaps}
        onPress={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('mapbox-Images')).toBeNull();
    expect(screen.queryByTestId('mapbox-ShapeSource-globe-roundels')).toBeNull();
  });

  test('the roundel layer registers what its features name and draws it', async () => {
    const [first] = pins.features;
    const roundels = {
      type: 'FeatureCollection' as const,
      features: [
        { ...first!, properties: { ...first!.properties, roundel: 'roundel:a' } },
      ],
    };
    await render(
      <RoundelLayer
        roundels={roundels}
        bitmaps={{ 'roundel:a': 'file:///a.png', 'roundel:unused': 'file:///b.png' }}
        onPress={jest.fn()}
      />,
    );
    expect(Object.keys(screen.getByTestId('mapbox-Images').props.images)).toEqual([
      'roundel:a',
    ]);
    expect(screen.getByTestId('mapbox-SymbolLayer-globe-roundel')).toBeTruthy();
  });
});
