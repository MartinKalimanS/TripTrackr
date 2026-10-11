/**
 * `GridSkeleton` - the placeholder of a grid while it loads (feature 004; contract C4-8
 * and C4-10 rule 2; FR-021, FR-029, FR-035; tasks.md T442), the sibling of `ListSkeleton`
 * for a screen whose rows are tiles (the photo gallery).
 *
 *   <GridSkeleton columns={3} rows={3} label="Loading photos" />
 *
 * What it guarantees is what `ListSkeleton` does, so a screen can swap one for the other:
 * - ONE announced `progressbar` named `label` (default "Loading"); every tile inside is
 *   hidden from assistive technology on both platforms, so a grid of nine boxes is one
 *   busy region and not nine anonymous focus stops. The region is `state-view.tsx`'s own
 *   (`LoadingRegion`, exported for this), not a copy of it.
 * - Shaped like the grid it stands in for: `rows` rows of `columns` square tiles that
 *   share the row's width (`flex-1 aspect-square`), a 16 dp gap both ways (the gallery's
 *   own `TILE_GAP`) and the 16 dp corner of a photograph's frame (`rounded-2xl`). The
 *   caller passes the column count the real grid will use (it follows the width and the
 *   text size), so the screen does not reflow when the photos arrive.
 * - It carries no text, so the largest text size cannot clip it. Under reduced motion the
 *   provider's `animation: 'disable-all'` stops the shimmer (research D4-05) and the tiles
 *   stay as static placeholders.
 *
 * It lives in its own file so that `state-view.tsx`, shared by every screen, gains one
 * export and nothing else. Colours are the kit's own skeleton classes; there is no
 * literal here.
 */
import { SkeletonGroup } from 'heroui-native';

import { LoadingRegion, type SkeletonRegionProps } from './state-view';

const DEFAULT_ROWS = 3;

export type GridSkeletonProps = SkeletonRegionProps & {
  /** Tiles per row; a fraction is truncated and anything below one is one. */
  columns: number;
  /** Rows of tiles; default 3. A fraction is truncated, a negative is none. */
  rows?: number;
};

/** A count of at least `floor`, whole, or `fallback` when it is not a finite number. */
function wholeCount(value: number, floor: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(floor, Math.trunc(value)) : fallback;
}

function TileRow({ columns }: { columns: number }) {
  return (
    <SkeletonGroup className="flex-row gap-4">
      {Array.from({ length: columns }, (_, index) => (
        <SkeletonGroup.Item key={index} className="aspect-square flex-1 rounded-2xl" />
      ))}
    </SkeletonGroup>
  );
}

export function GridSkeleton({
  columns,
  rows = DEFAULT_ROWS,
  ...region
}: GridSkeletonProps) {
  const across = wholeCount(columns, 1, 1);
  const down = wholeCount(rows, 0, DEFAULT_ROWS);

  return (
    <LoadingRegion gap="gap-4" {...region}>
      {Array.from({ length: down }, (_, index) => (
        <TileRow key={index} columns={across} />
      ))}
    </LoadingRegion>
  );
}
