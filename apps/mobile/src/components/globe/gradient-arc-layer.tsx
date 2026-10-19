/**
 * The gradient overlay of the connections — feature 005, T532 (FR-010, FR-082; research
 * D5-04, contract C5-24).
 *
 * Its own `ShapeSource` with `lineMetrics: true` and three `LineLayer`s, each with a
 * `lineGradient` over `line-progress` from the `GlobeColors` stops (`gradient-arcs.ts`):
 * the legs between trips, past connections and active connections. Each sits directly
 * above the solid layer it covers, so the stack stays casing, past, planned, active with
 * the active trip never under another. It has no press and no hit box: the shared hit
 * source (`ArcSource`) answers every tap, unchanged, and keeps its solid lines under the
 * gradient as the fallback.
 */
import { LineLayer, ShapeSource } from '@rnmapbox/maps';
import { useMemo } from 'react';

import type { ArcCollection, JourneyCollection } from './arc-features';
import type { GlobePalette } from './arc-styles';
import {
  GRADIENT_ABOVE,
  arcGradientStyle,
  gradientCollection,
  gradientFilter,
  type GradientStatus,
} from './gradient-arcs';

const LAYER_IDS: Readonly<Record<GradientStatus, string>> = {
  journey: 'globe-journey-gradient',
  past: 'globe-arc-past-gradient',
  active: 'globe-arc-active-gradient',
};

/** Bottom of the stack first: the journey, then past, then active. */
const GRADIENT_ORDER: readonly GradientStatus[] = ['journey', 'past', 'active'];

export type GradientArcLayerProps = {
  arcs: ArcCollection;
  journey: JourneyCollection;
  palette: GlobePalette;
};

/**
 * A plain function, not a component: a layer takes its source from the `ShapeSource` that is
 * its DIRECT parent (`sourceID` is injected into the children), so a wrapper component would
 * leave it pointing at the default source.
 */
function gradientLine(status: GradientStatus, palette: GlobePalette) {
  return (
    <LineLayer
      key={status}
      id={LAYER_IDS[status]}
      aboveLayerID={GRADIENT_ABOVE[status]}
      filter={gradientFilter(status)}
      style={arcGradientStyle(status, palette)}
    />
  );
}

export function GradientArcLayer({ arcs, journey, palette }: GradientArcLayerProps) {
  const shape = useMemo(() => gradientCollection(arcs, journey), [arcs, journey]);
  return (
    <ShapeSource id="globe-arc-gradients" shape={shape} lineMetrics>
      {GRADIENT_ORDER.map((status) => gradientLine(status, palette))}
    </ShapeSource>
  );
}
