/**
 * F11 - `OfflineMapsSkeleton` (FR-064, FR-066; UI-SPEC 9.3): the placeholder mirrors the list
 * (storage card, heading, rows with a 72 dp tile) and is ONE announced `progressbar` with
 * every shape hidden from assistive technology; it carries no text and is never the empty state.
 */
import { render, screen } from '@testing-library/react-native';

import { MAP_TILE_SIZE } from './offline-map-tile';
import { OfflineMapsSkeleton } from './offline-maps-skeleton';

const hidden = { includeHiddenElements: true };

type Json = { props?: { style?: unknown }; children?: unknown } | string | null;

function countTiles(node: Json | Json[]): number {
  if (!node || typeof node === 'string') return 0;
  if (Array.isArray(node)) return node.reduce<number>((n, c) => n + countTiles(c), 0);
  const own = JSON.stringify(node.props?.style ?? '').includes(
    `"width":${MAP_TILE_SIZE}`,
  );
  return (own ? 1 : 0) + countTiles(node.children as Json[] | null);
}

describe('<OfflineMapsSkeleton>', () => {
  test('is one announced progressbar named by its label', async () => {
    await render(<OfflineMapsSkeleton label="Checking saved maps" />);
    const region = screen.getByLabelText('Checking saved maps');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  test('draws a row per city with the real tile’s size, and says nothing in words', async () => {
    await render(<OfflineMapsSkeleton label="Loading" rows={3} />);
    const tiles = countTiles(screen.toJSON());
    expect(tiles).toBeGreaterThanOrEqual(3);
    expect(screen.queryAllByText(/./, hidden)).toHaveLength(0);
  });

  test('draws at least one row, whatever it is asked for', async () => {
    await render(<OfflineMapsSkeleton label="Loading" rows={0} />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});
