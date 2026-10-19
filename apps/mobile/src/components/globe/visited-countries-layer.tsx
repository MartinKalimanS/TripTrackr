/**
 * Visited and planned countries — feature 005, T532 (FR-010; research D5-04, contract
 * C5-24).
 *
 * A `VectorSource` on Mapbox Countries v1 (`mapbox://mapbox.country-boundaries-v1`, source
 * layer `country_boundaries`, `iso_3166_1` the alpha-2 code) and, in the bottom slot, a
 * token `FillLayer` for the visited countries with a coral keyline over it, and an amber
 * DASHED keyline for the planned ones, each keyline on a wider solid casing (white by day). The fill is a tint only (1.37:1 on light land): the
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

import {
  GlobeColors,
  GlobeLayers,
  GlobeStyle,
  type GlobeScheme,
} from '@/constants/theme';

import { countryFilter } from './country-filter';

const { sourceLayer, keylineWidth, plannedKeylineWidth, plannedDash, casingExtra, url } =
  GlobeLayers.countries;

const KEYLINE_BASE = {
  lineCap: 'round',
  lineJoin: 'round',
  lineEmissiveStrength: 1,
} as const;

export function visitedFillStyle(scheme: GlobeScheme): FillLayerStyle {
  return { fillColor: GlobeColors[scheme].visitedFill, fillEmissiveStrength: 1 };
}

/**
 * The solid stroke under a keyline, `casingExtra` wider than it: the prototype strokes every
 * tinted country twice, a wider white (night: navy) edge and then the coloured line, which is
 * what lifts a keyline off both the cream land and the sea next to it. Never dashed, so a
 * planned keyline's gaps show the casing and not the land.
 */
export function keylineCasingStyle(scheme: GlobeScheme, keyline: number): LineLayerStyle {
  const { visitedCasing, visitedCasingOpacity } = GlobeStyle[scheme];
  return {
    ...KEYLINE_BASE,
    lineColor: visitedCasing,
    lineOpacity: visitedCasingOpacity,
    lineWidth: keyline + casingExtra,
  };
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

type CountryFilter = NonNullable<ReturnType<typeof countryFilter>>;

/** A line layer of the tileset, in the bottom slot, filtered to its countries. */
function countryLine(id: string, filter: CountryFilter, style: LineLayerStyle) {
  return (
    <LineLayer
      key={id}
      id={id}
      sourceLayerID={sourceLayer}
      slot="bottom"
      filter={filter}
      style={style}
    />
  );
}

function visitedLayers(scheme: GlobeScheme, filter: CountryFilter): ReactElement[] {
  return [
    <FillLayer
      key="globe-visited-fill"
      id="globe-visited-fill"
      sourceLayerID={sourceLayer}
      slot="bottom"
      filter={filter}
      style={visitedFillStyle(scheme)}
    />,
    countryLine('globe-visited-casing', filter, keylineCasingStyle(scheme, keylineWidth)),
    countryLine('globe-visited-keyline', filter, visitedKeylineStyle(scheme)),
  ];
}

function plannedLayers(scheme: GlobeScheme, filter: CountryFilter): ReactElement[] {
  return [
    countryLine(
      'globe-planned-casing',
      filter,
      keylineCasingStyle(scheme, plannedKeylineWidth),
    ),
    countryLine('globe-planned-keyline', filter, plannedKeylineStyle(scheme)),
  ];
}

export function VisitedCountriesLayer({
  scheme,
  visited,
  planned,
}: VisitedCountriesLayerProps) {
  const visitedFilter = countryFilter(visited);
  const plannedFilter = countryFilter(planned);
  if (!visitedFilter && !plannedFilter) return null;

  return (
    <VectorSource id="globe-countries" url={url}>
      {[
        ...(visitedFilter ? visitedLayers(scheme, visitedFilter) : []),
        ...(plannedFilter ? plannedLayers(scheme, plannedFilter) : []),
      ]}
    </VectorSource>
  );
}
