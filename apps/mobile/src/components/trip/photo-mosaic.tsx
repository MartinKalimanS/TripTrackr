/**
 * `PhotoMosaic` and `DaySection` - a day of the gallery (feature 005, T549; FR-045; UI-SPEC
 * 9.2; prototype `.day`, `.mos`; pictures `more/photos*.png`).
 *
 *   <DaySection group={day} dayIndex={0} width={350} expanded={false}
 *               onOpen={open} onRetry={retry} onExpand={() => expand(day.key)} />
 *
 * `DaySection` is the day's `DayHeader` over its `PhotoMosaic`, with 24 dp under it. The mosaic
 * is the geometry of `features/photos/photo-mosaic.ts` drawn at `width`: three columns, a 4 dp
 * gap, square cells (114 dp on a 390 dp phone), the first photograph large (2 by 2), two stacked
 * beside it, the rest three across; the large tile alternates side from day to day. A day of more
 * than six photographs shows five and a sixth `+N` tile (`visibleTiles`); pressing it shows the
 * whole day (`onExpand`), where there is no `+N` any more. The width comes from the screen's
 * window, not from a layout pass, so the first frame is already the right one and the list does
 * not reflow when it arrives; nothing in a tile is text that has to fit, so three columns hold
 * at every text size.
 */
import { View } from 'react-native';

import { DayHeader } from '@/components/trip/day-header';
import { PhotoTile } from '@/components/trip/photo-tile';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import type { DayGroup } from '@/features/photos/photo-days';
import {
  MOSAIC_MAX_TILES,
  frameOf,
  leadSideOf,
  mosaicCells,
  mosaicHeight,
  tileSize,
  visibleTiles,
} from '@/features/photos/photo-mosaic';
import { Space } from '@/theme';

export type PhotoMosaicProps = {
  group: DayGroup;
  dayIndex: number;
  /** The mosaic's width in dp. */
  width: number;
  expanded: boolean;
  now: number;
  onOpen: (photo: PhotoWithPlace) => void;
  onRetry: (photo: PhotoWithPlace) => void;
  onExpand: () => void;
};

export function PhotoMosaic({
  group,
  dayIndex,
  width,
  expanded,
  now,
  onOpen,
  onRetry,
  onExpand,
}: PhotoMosaicProps) {
  const { tiles, more } = visibleTiles(group.photos, expanded);
  const cells = mosaicCells(tiles.length, leadSideOf(dayIndex));
  const size = tileSize(width);
  const moreLabel = `${more} more ${more === 1 ? 'photo' : 'photos'} from ${group.label}`;

  return (
    <View
      testID={`day-mosaic-${group.key}`}
      style={{ width, height: mosaicHeight(cells, size) }}>
      {cells.map((cell) => {
        const photo = tiles[cell.index];
        const last = more > 0 && cell.index === MOSAIC_MAX_TILES - 1;
        return (
          <PhotoTile
            key={photo.id}
            photo={photo}
            frame={frameOf(cell, size)}
            now={now}
            more={last ? { count: more, label: moreLabel } : undefined}
            onOpen={onOpen}
            onRetry={onRetry}
            onMore={onExpand}
          />
        );
      })}
    </View>
  );
}

export type DaySectionProps = PhotoMosaicProps;

export function DaySection(props: DaySectionProps) {
  return (
    <View testID={`day-section-${props.group.key}`} style={{ paddingBottom: Space[6] }}>
      <DayHeader group={props.group} />
      <PhotoMosaic {...props} />
    </View>
  );
}
