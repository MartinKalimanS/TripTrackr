/**
 * The cluster of dots (F1 pins): where pins without a roundel crowd, an ink disc with a bold
 * count, "+3" (the prototype's `.roundel.cluster`). A tap on it opens nothing.
 */
import { render, screen } from '@testing-library/react-native';

import { GlobeColors, GlobeLayers, GlobeStyle } from '@/constants/theme';

import type { PinCollection } from '../pin-features';
import { clusterCountStyle, clusterDiscStyle, PinLayer } from '../pin-layer';
import { tripIdFromPress } from '../use-arc-press';

const none: PinCollection = { type: 'FeatureCollection', features: [] };

function renderDots(scheme: 'light' | 'dark' = 'light') {
  return render(
    <PinLayer
      split={{ roundels: { type: 'FeatureCollection', features: [] }, dots: none }}
      bitmaps={{}}
      palette={GlobeColors[scheme]}
      scheme={scheme}
      onPress={jest.fn()}
    />,
  );
}

describe('the dots cluster', () => {
  test('the dot source clusters, within the radius and up to the zoom of the tokens', async () => {
    await renderDots();
    const source = screen.getByTestId('mapbox-ShapeSource-globe-pins').props;
    expect(source.cluster).toBe(true);
    expect(source.clusterRadius).toBe(GlobeLayers.pins.cluster.radius);
    expect(source.clusterMaxZoomLevel).toBe(GlobeLayers.pins.cluster.maxZoom);
  });

  test('a dot is drawn only where it is not clustered; the disc and the count only where it is', async () => {
    await renderDots();
    const filter = (id: string) => screen.getByTestId(id).props.filter;
    expect(filter('mapbox-CircleLayer-globe-pin-dot')).toEqual([
      '!',
      ['has', 'point_count'],
    ]);
    expect(filter('mapbox-CircleLayer-globe-pin-cluster')).toEqual([
      'has',
      'point_count',
    ]);
    expect(filter('mapbox-SymbolLayer-globe-pin-cluster-count')).toEqual([
      'has',
      'point_count',
    ]);
  });

  test.each(['light', 'dark'] as const)(
    '%s: an ink disc 40 dp across with the roundel ring, and a bold count "+N"',
    (scheme) => {
      const { pin } = GlobeStyle[scheme];
      expect(clusterDiscStyle(scheme)).toMatchObject({
        circleColor: pin.clusterFill,
        circleRadius: GlobeLayers.pins.clusterSize / 2,
        circleStrokeColor: pin.ring,
        circleStrokeWidth: GlobeLayers.pins.roundelRing,
      });
      const count = clusterCountStyle(scheme);
      expect(count).toMatchObject({
        textField: ['concat', '+', ['to-string', ['get', 'point_count']]],
        textColor: pin.clusterLabel,
        textSize: GlobeLayers.pins.cluster.textSize,
        textAllowOverlap: true,
      });
      expect(String(count.textFont)).toContain('Bold');
    },
  );

  test('the disc follows the theme the layer is given: navy by day, a light disc by night', async () => {
    await renderDots('dark');
    expect(
      screen.getByTestId('mapbox-CircleLayer-globe-pin-cluster').props.layerStyle
        .circleColor,
    ).toBe(GlobeStyle.dark.pin.clusterFill);
    expect(GlobeStyle.light.pin.clusterFill).toBe('#0E2A47');
  });

  test('the cluster layers sit under the roundels (they are in the dot source, drawn first)', async () => {
    await renderDots();
    expect(screen.queryByTestId('mapbox-ShapeSource-globe-roundels')).toBeNull();
  });

  test('a tap on a cluster carries no trip id, so it opens nothing', () => {
    expect(
      tripIdFromPress([{ properties: { cluster: true, point_count: 3 } }]),
    ).toBeNull();
  });
});
