/**
 * The arc source — T094, FR-045 to FR-047, research D-30.
 *
 * Two sources: the connections (densified great circles, `arc-features.ts`)
 * and a marker per placed stop, so a single-stop trip still shows. Lines are
 * stacked casing, past, planned, active — the active trip is drawn last and
 * so is never under another. Both sources answer a tap across the platform's
 * minimum touch target (FR-011), which a 1.5-point line could never offer on
 * its own; `use-arc-press.ts` decides which trip opens.
 */
import { CircleLayer, LineLayer, ShapeSource } from '@rnmapbox/maps';

import { MinTouchTarget } from '@/constants/theme';

import type { ArcCollection, MarkerCollection } from './arc-features';
import {
  arcStyle,
  casingStyle,
  markerStyle,
  statusFilter,
  type GlobePalette,
} from './arc-styles';
import type { GlobePressEvent } from './use-arc-press';

const HITBOX = { width: MinTouchTarget, height: MinTouchTarget };

export type ArcSourceProps = {
  arcs: ArcCollection;
  markers: MarkerCollection;
  palette: GlobePalette;
  onPress: (event: GlobePressEvent) => void;
};

export function ArcSource({ arcs, markers, palette, onPress }: ArcSourceProps) {
  return (
    <>
      <ShapeSource id="globe-arcs" shape={arcs} hitbox={HITBOX} onPress={onPress}>
        <LineLayer id="globe-arc-casing" style={casingStyle(palette)} />
        <LineLayer
          id="globe-arc-past"
          filter={statusFilter('past')}
          style={arcStyle('past', palette)}
        />
        <LineLayer
          id="globe-arc-planning"
          filter={statusFilter('planning')}
          style={arcStyle('planning', palette)}
        />
        <LineLayer
          id="globe-arc-active"
          filter={statusFilter('active')}
          style={arcStyle('active', palette)}
        />
      </ShapeSource>
      <ShapeSource id="globe-markers" shape={markers} hitbox={HITBOX} onPress={onPress}>
        <CircleLayer id="globe-marker" style={markerStyle(palette)} />
      </ShapeSource>
    </>
  );
}
