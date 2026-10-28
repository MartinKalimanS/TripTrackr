/**
 * The mosaic of a day (T549; FR-045; UI-SPEC 9.2): one large tile, two stacked, three across;
 * tiles 114 dp on a 390 dp phone, gap 4; the `+N` rule.
 */
import {
  MOSAIC_GAP,
  frameOf,
  leadSideOf,
  mosaicCells,
  mosaicHeight,
  tileSize,
  visibleTiles,
} from '@/features/photos/photo-mosaic';

const place = (cells: ReturnType<typeof mosaicCells>) =>
  cells.map((c) => [c.index, c.column, c.row, c.columns, c.rows]);

describe('mosaicCells', () => {
  test('six tiles: the large one, two stacked, three across (photos.png)', () => {
    expect(place(mosaicCells(6))).toEqual([
      [0, 0, 0, 2, 2],
      [1, 2, 0, 1, 1],
      [2, 2, 1, 1, 1],
      [3, 0, 2, 1, 1],
      [4, 1, 2, 1, 1],
      [5, 2, 2, 1, 1],
    ]);
    expect(mosaicCells(6)[0].lead).toBe(true);
    expect(mosaicCells(6).filter((c) => c.lead)).toHaveLength(1);
  });

  test('on the end side the large tile is at the right of the two stacked ones', () => {
    expect(place(mosaicCells(5, 'end'))).toEqual([
      [0, 1, 0, 2, 2],
      [1, 0, 0, 1, 1],
      [2, 0, 1, 1, 1],
      [3, 0, 2, 1, 1],
      [4, 1, 2, 1, 1],
    ]);
  });

  test('three photographs make the block with no hole', () => {
    expect(place(mosaicCells(3))).toEqual([
      [0, 0, 0, 2, 2],
      [1, 2, 0, 1, 1],
      [2, 2, 1, 1, 1],
    ]);
  });

  test('two photographs: the large tile and a tall one; one: a wide tile', () => {
    expect(place(mosaicCells(2))).toEqual([
      [0, 0, 0, 2, 2],
      [1, 2, 0, 1, 2],
    ]);
    expect(place(mosaicCells(2, 'end'))).toEqual([
      [0, 1, 0, 2, 2],
      [1, 0, 0, 1, 2],
    ]);
    expect(place(mosaicCells(1))).toEqual([[0, 0, 0, 3, 2]]);
  });

  test('none, or a count that is not a count, is nothing', () => {
    expect(mosaicCells(0)).toEqual([]);
    expect(mosaicCells(-3)).toEqual([]);
    expect(mosaicCells(Number.NaN)).toEqual([]);
  });

  test('a fully expanded day keeps going three across, row after row', () => {
    expect(place(mosaicCells(11)).slice(6)).toEqual([
      [6, 0, 3, 1, 1],
      [7, 1, 3, 1, 1],
      [8, 2, 3, 1, 1],
      [9, 0, 4, 1, 1],
      [10, 1, 4, 1, 1],
    ]);
  });

  test('no two tiles overlap and none leaves the three columns', () => {
    for (const side of ['start', 'end'] as const) {
      for (let count = 1; count <= 14; count += 1) {
        const taken = new Set<string>();
        for (const c of mosaicCells(count, side)) {
          expect(c.column + c.columns).toBeLessThanOrEqual(3);
          for (let col = c.column; col < c.column + c.columns; col += 1) {
            for (let row = c.row; row < c.row + c.rows; row += 1) {
              const at = `${col},${row}`;
              expect(taken.has(at)).toBe(false);
              taken.add(at);
            }
          }
        }
      }
    }
  });
});

describe('leadSideOf alternates by day', () => {
  test('start, end, start, end', () => {
    expect([0, 1, 2, 3].map(leadSideOf)).toEqual(['start', 'end', 'start', 'end']);
  });
});

describe('visibleTiles: the +N rule', () => {
  const photos = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

  test('up to six photographs are all tiles, with no +N', () => {
    expect(visibleTiles(photos(6))).toEqual({ tiles: photos(6), more: 0 });
    expect(visibleTiles(photos(1))).toEqual({ tiles: photos(1), more: 0 });
    expect(visibleTiles([])).toEqual({ tiles: [], more: 0 });
  });

  test('seven or more show six tiles and the sixth says how many are not shown yet', () => {
    expect(visibleTiles(photos(7))).toEqual({ tiles: photos(7).slice(0, 6), more: 2 });
    // 14 photographs: five are shown, nine are behind the sixth tile (photos.png "+9").
    expect(visibleTiles(photos(14))).toEqual({ tiles: photos(14).slice(0, 6), more: 9 });
  });

  test('an expanded day shows every photograph and no +N', () => {
    expect(visibleTiles(photos(14), true)).toEqual({ tiles: photos(14), more: 0 });
  });
});

describe('geometry: 114 dp tiles, gap 4 (390 dp phone, 20 dp margins)', () => {
  test('a 350 dp mosaic has 114 dp tiles', () => {
    expect(MOSAIC_GAP).toBe(4);
    expect(tileSize(350)).toBe(114);
  });

  test('the large tile is two tiles and a gap; the frames sit on the grid', () => {
    const cells = mosaicCells(6);
    expect(frameOf(cells[0], 114)).toEqual({ left: 0, top: 0, width: 232, height: 232 });
    expect(frameOf(cells[1], 114)).toEqual({
      left: 236,
      top: 0,
      width: 114,
      height: 114,
    });
    expect(frameOf(cells[2], 114)).toEqual({
      left: 236,
      top: 118,
      width: 114,
      height: 114,
    });
    expect(frameOf(cells[5], 114)).toEqual({
      left: 236,
      top: 236,
      width: 114,
      height: 114,
    });
  });

  test('the wide tile spans all three columns', () => {
    expect(frameOf(mosaicCells(1)[0], 114)).toEqual({
      left: 0,
      top: 0,
      width: 350,
      height: 232,
    });
  });

  test('the height is the rows and their gaps', () => {
    expect(mosaicHeight(mosaicCells(6), 114)).toBe(350);
    expect(mosaicHeight(mosaicCells(3), 114)).toBe(232);
    expect(mosaicHeight([], 114)).toBe(0);
  });

  test('a width not measured, or negative, gives no tile', () => {
    expect(tileSize(0)).toBe(0);
    expect(tileSize(-10)).toBe(0);
    expect(tileSize(Number.NaN)).toBe(0);
  });
});
