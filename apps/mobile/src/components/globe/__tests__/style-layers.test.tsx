/**
 * The Sunrise style layers — feature 005, T532 (FR-010, FR-082; research D5-04, contract
 * C5-24).
 *
 * Mapbox renders natively, so these suites assert on what the app HANDS it: the Jest stand-in
 * in `jest.setup.ts` turns each component into a View tagged `mapbox-<Kind>-<id>` carrying
 * its props (a layer's `style` arrives as `layerStyle`). The prop names are the ones in the
 * `@rnmapbox/maps` 10.3.5 typings (`Atmosphere`: `style` with `color`, `highColor`,
 * `spaceColor`, `horizonBlend`, `starIntensity`; `VectorSource`: `url`; the layers:
 * `sourceLayerID`, `slot`, `aboveLayerID`, `filter`; `ShapeSource`: `lineMetrics`).
 */
import { render, screen } from '@testing-library/react-native';

import { GlobeColors, GlobeLayers, GlobeStyle } from '@/constants/theme';

import type { ArcCollection, JourneyCollection } from '../arc-features';
import { AtmosphereLayer } from '../atmosphere-layer';
import { COUNTRY_WORLDVIEW_CLAUSE, countryFilter } from '../country-filter';
import { GradientArcLayer } from '../gradient-arc-layer';
import { gradientCollection } from '../gradient-arcs';
import { GraticuleLayer } from '../graticule-layer';
import { VisitedCountriesLayer } from '../visited-countries-layer';
import { graticule } from '@/features/globe/graticule';

const SCHEMES = ['light', 'dark'] as const;

describe('<AtmosphereLayer>', () => {
  test.each(SCHEMES)(
    '%s: the five atmosphere properties come from the tokens',
    async (scheme) => {
      await render(<AtmosphereLayer scheme={scheme} />);
      const { color, highColor, spaceColor, horizonBlend, starIntensity } =
        GlobeStyle[scheme].atmosphere;
      expect(screen.getByTestId('mapbox-Atmosphere').props.layerStyle).toEqual({
        color,
        highColor,
        spaceColor,
        horizonBlend,
        starIntensity,
      });
    },
  );
});

describe('<GraticuleLayer>', () => {
  test.each(SCHEMES)(
    '%s: one static source of lines, one thin faint line layer',
    async (scheme) => {
      await render(<GraticuleLayer scheme={scheme} />);
      const source = screen.getByTestId('mapbox-ShapeSource-globe-graticule');
      expect(source.props.shape).toEqual(graticule(GlobeLayers.graticule.step));

      const layer = screen.getByTestId('mapbox-LineLayer-globe-graticule-line');
      expect(layer.props.slot).toBe('bottom');
      expect(layer.props.layerStyle).toMatchObject({
        lineColor: GlobeStyle[scheme].graticule,
        lineWidth: GlobeLayers.graticule.width,
        lineEmissiveStrength: 1,
      });
    },
  );

  test('fades out as the traveller comes in: opaque at the start zoom, gone above the end', async () => {
    await render(<GraticuleLayer scheme="light" />);
    const { fadeStartZoom, fadeEndZoom } = GlobeLayers.graticule;
    expect(
      screen.getByTestId('mapbox-LineLayer-globe-graticule-line').props.layerStyle
        .lineOpacity,
    ).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      fadeStartZoom,
      GlobeStyle.light.graticuleOpacity,
      fadeEndZoom,
      0,
    ]);
    expect(fadeEndZoom).toBe(4);
  });

  test('is thin: under 1.5 dp, the width of the thinnest connection', () => {
    expect(GlobeLayers.graticule.width).toBeLessThan(1.5);
    expect(GlobeLayers.graticule.step).toBe(30);
  });
});

describe('<VisitedCountriesLayer>', () => {
  const countries = (props = {}) =>
    render(
      <VisitedCountriesLayer
        scheme="light"
        visited={['PT', 'ES']}
        planned={['IS']}
        {...props}
      />,
    );

  test('is a vector source on the country boundaries tileset', async () => {
    await countries();
    expect(screen.getByTestId('mapbox-VectorSource-globe-countries').props.url).toBe(
      'mapbox://mapbox.country-boundaries-v1',
    );
  });

  test.each(SCHEMES)(
    '%s: the visited fill is a token fill in the bottom slot',
    async (scheme) => {
      await countries({ scheme });
      const fill = screen.getByTestId('mapbox-FillLayer-globe-visited-fill');
      expect(fill.props.sourceLayerID).toBe('country_boundaries');
      expect(fill.props.slot).toBe('bottom');
      expect(fill.props.filter).toEqual(countryFilter(['PT', 'ES']));
      expect(fill.props.layerStyle).toEqual({
        fillColor: GlobeColors[scheme].visitedFill,
        fillEmissiveStrength: 1,
      });
    },
  );

  test.each(SCHEMES)(
    '%s: a coral keyline over the fill, thin and solid',
    async (scheme) => {
      await countries({ scheme });
      const keyline = screen.getByTestId('mapbox-LineLayer-globe-visited-keyline');
      expect(keyline.props.sourceLayerID).toBe('country_boundaries');
      expect(keyline.props.slot).toBe('bottom');
      expect(keyline.props.filter).toEqual(countryFilter(['PT', 'ES']));
      expect(keyline.props.layerStyle).toMatchObject({
        lineColor: GlobeColors[scheme].visitedKeyline,
        lineWidth: GlobeLayers.countries.keylineWidth,
        lineEmissiveStrength: 1,
      });
      expect(keyline.props.layerStyle).not.toHaveProperty('lineDasharray');
    },
  );

  test.each(SCHEMES)(
    '%s: planned countries get an amber DASHED keyline',
    async (scheme) => {
      await countries({ scheme });
      const planned = screen.getByTestId('mapbox-LineLayer-globe-planned-keyline');
      expect(planned.props.filter).toEqual(countryFilter(['IS']));
      expect(planned.props.layerStyle).toMatchObject({
        lineColor: GlobeColors[scheme].plannedKeyline,
        lineDasharray: [...GlobeLayers.countries.plannedDash],
        lineEmissiveStrength: 1,
      });
    },
  );

  test('stacks the fill, then the visited keyline, then the planned keyline', async () => {
    await countries();
    const order = screen
      .getAllByTestId(/^mapbox-(FillLayer|LineLayer)-/)
      .map((node) => node.props.id);
    expect(order).toEqual([
      'globe-visited-fill',
      'globe-visited-keyline',
      'globe-planned-keyline',
    ]);
  });

  test('EVERY layer on the tileset carries the worldview clause, or a disputed area draws twice', async () => {
    await countries();
    const layers = screen.getAllByTestId(/^mapbox-(FillLayer|LineLayer)-/);
    expect(layers).toHaveLength(3);
    for (const layer of layers) {
      expect(layer.props.filter).toContainEqual(COUNTRY_WORLDVIEW_CLAUSE);
    }
  });

  test('draws no planned layer when nothing is planned, and no visited layer when nothing is visited', async () => {
    const view = await countries({ planned: [] });
    expect(screen.queryByTestId('mapbox-LineLayer-globe-planned-keyline')).toBeNull();
    expect(screen.getByTestId('mapbox-FillLayer-globe-visited-fill')).toBeTruthy();

    await view.rerender(
      <VisitedCountriesLayer scheme="light" visited={[]} planned={['IS']} />,
    );
    expect(screen.queryByTestId('mapbox-FillLayer-globe-visited-fill')).toBeNull();
    expect(screen.queryByTestId('mapbox-LineLayer-globe-visited-keyline')).toBeNull();
    expect(screen.getByTestId('mapbox-LineLayer-globe-planned-keyline')).toBeTruthy();
  });

  test('loads no tiles at all when there is nothing to tint', async () => {
    await countries({ visited: [], planned: [] });
    expect(screen.queryByTestId('mapbox-VectorSource-globe-countries')).toBeNull();
  });
});

describe('<GradientArcLayer>', () => {
  const arcs: ArcCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'a',
        geometry: {
          type: 'LineString',
          coordinates: [
            [0, 0],
            [10, 10],
          ],
        },
        properties: { trip_id: 't', status: 'active', from_city_id: 1, to_city_id: 2 },
      },
      {
        type: 'Feature',
        id: 'b',
        geometry: {
          type: 'LineString',
          coordinates: [
            [10, 10],
            [20, 20],
          ],
        },
        properties: { trip_id: 't', status: 'planning', from_city_id: 2, to_city_id: 3 },
      },
    ],
  };
  const journey: JourneyCollection = { type: 'FeatureCollection', features: [] };

  test('is its own source, with line metrics, holding the gradient features', async () => {
    await render(
      <GradientArcLayer arcs={arcs} journey={journey} palette={GlobeColors.light} />,
    );
    const source = screen.getByTestId('mapbox-ShapeSource-globe-arc-gradients');
    expect(source.props.lineMetrics).toBe(true);
    expect(source.props.shape).toEqual(gradientCollection(arcs, journey));
    expect(source.props.shape.features.map((f: { id: string }) => f.id)).toEqual(['a']);
  });

  test('is not tappable: the shared hit source answers every press', async () => {
    await render(
      <GradientArcLayer arcs={arcs} journey={journey} palette={GlobeColors.light} />,
    );
    const source = screen.getByTestId('mapbox-ShapeSource-globe-arc-gradients');
    expect(source.props.onPress).toBeUndefined();
    expect(source.props.hitbox).toBeUndefined();
  });

  test.each([
    ['globe-journey-gradient', 'journey', 'globe-journey-line'],
    ['globe-arc-past-gradient', 'past', 'globe-arc-past'],
    ['globe-arc-active-gradient', 'active', 'globe-arc-active'],
  ] as const)('%s draws the %s status directly above %s', async (id, status, above) => {
    await render(
      <GradientArcLayer arcs={arcs} journey={journey} palette={GlobeColors.dark} />,
    );
    const layer = screen.getByTestId(`mapbox-LineLayer-${id}`);
    expect(layer.props.aboveLayerID).toBe(above);
    expect(layer.props.filter).toEqual(['==', ['get', 'status'], status]);
    expect(layer.props.layerStyle.lineGradient).toEqual([
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,
      GlobeColors.dark[status === 'active' ? 'active' : 'past'],
      1,
      GlobeColors.dark[status === 'active' ? 'activeEnd' : 'pastEnd'],
    ]);
  });
});
