/**
 * Visited and planned countries — feature 005, T532 (FR-010; research D5-04, contract
 * C5-24).
 *
 * A `VectorSource` on Mapbox Countries v1 (`mapbox://mapbox.country-boundaries-v1`, source
 * layer `country_boundaries`, `iso_3166_1` the alpha-2 code) and, in the bottom slot, a
 * token `FillLayer` for the visited countries with a coral keyline over it, and an amber
 * DASHED keyline for the planned ones. The fill is a tint only (1.37:1 on light land): the
 * keyline carries the meaning (the gate, C5-11). Every layer is filtered by the same
 * worldview clause as the codes (`country-filter.ts`), or a disputed area would draw twice
 * and its alpha stack. With nothing to tint nothing mounts, so no tile is loaded.
 *
 * The codes come from the local store (`features/globe/country-codes.ts`).
 */
import {
  FillLayer,
  LineLayer,
  VectorSource,
  type FillLayerStyle,
  type LineLayerStyle,
} from '@rnmapbox/maps';
import type { ReactElement } from 'react';

import { GlobeColors, GlobeLayers, type GlobeScheme } from '@/constants/theme';

import { countryFilter } from './country-filter';

const { sourceLayer, keylineWidth, plannedKeylineWidth, plannedDash, url } =
  GlobeLayers.countries;

const KEYLINE_BASE = {
  lineCap: 'round',
  lineJoin: 'round',
  lineEmissiveStrength: 1,
} as const;

export function visitedFillStyle(scheme: GlobeScheme): FillLayerStyle {
  return { fillColor: GlobeColors[scheme].visitedFill, fillEmissiveStrength: 1 };
}

export function visitedKeylineStyle(scheme: GlobeScheme): LineLayerStyle {
  return {
    ...KEYLINE_BASE,
    lineColor: GlobeColors[scheme].visitedKeyline,
    lineWidth: keylineWidth,
  };
}

export function plannedKeylineStyle(scheme: GlobeScheme): LineLayerStyle {
  return {
    ...KEYLINE_BASE,
    lineColor: GlobeColors[scheme].plannedKeyline,
    lineWidth: plannedKeylineWidth,
    lineDasharray: [...plannedDash],
  };
}

export type VisitedCountriesLayerProps = {
  scheme: GlobeScheme;
  /** ISO 3166-1 alpha-2, as `countryCodes` returns them. */
  visited: readonly string[];
  planned: readonly string[];
};

export function VisitedCountriesLayer({
  scheme,
  visited,
  planned,
}: VisitedCountriesLayerProps) {
  const visitedFilter = countryFilter(visited);
  const plannedFilter = countryFilter(planned);
  if (!visitedFilter && !plannedFilter) return null;

  const layers: ReactElement[] = [];
  if (visitedFilter) {
    layers.push(
      <FillLayer
        key="fill"
        id="globe-visited-fill"
        sourceLayerID={sourceLayer}
        slot="bottom"
        filter={visitedFilter}
        style={visitedFillStyle(scheme)}
      />,
      <LineLayer
        key="keyline"
        id="globe-visited-keyline"
        sourceLayerID={sourceLayer}
        slot="bottom"
        filter={visitedFilter}
        style={visitedKeylineStyle(scheme)}
      />,
    );
  }
  if (plannedFilter) {
    layers.push(
      <LineLayer
        key="planned"
        id="globe-planned-keyline"
        sourceLayerID={sourceLayer}
        slot="bottom"
        filter={plannedFilter}
        style={plannedKeylineStyle(scheme)}
      />,
    );
  }
  return (
    <VectorSource id="globe-countries" url={url}>
      {layers}
    </VectorSource>
  );
}
