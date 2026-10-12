/**
 * The baked wear of a passport stamp (feature 005; research D5-08; spike V5 / T511).
 *
 * `react-native-svg` 15.15.4 implements no `feTurbulence`, `feDisplacementMap` or
 * `feMorphology`: a filter-made grunge warns and draws nothing. So the distressed edge is DATA:
 * four fixed textures, each ONE path made of the whole 120 by 120 box followed by a few hundred
 * small irregular holes, to be filled with the even-odd rule as the shape of an SVG `<Mask>`
 * (a stamp is the ink seen through it). One path is one node however many holes it holds, which
 * answers the objection to a mask of 100 circles ("too many nodes for a list").
 *
 * The holes come from a seeded integer generator (`mulberry32` over `fnv1a32` of the texture's
 * name), so a texture is the same on every device and launch, and are cut once on first use and
 * kept. A texture is 130 specks, 26 chips, 7 blotches and 5 scratches: about 8.7 kB of path
 * data, and 4 to 5 percent of the box (measured by the shoelace sum of the holes), which is
 * more of the ink wherever the ink is. The amounts are a starting point that device check V5
 * tunes against the prototype's grunge.
 *
 * Pure.
 */
import { fnv1a32 } from '@/lib/fnv1a';

import type { StampWear } from './stamp-spec';

/** The side of the box every stamp is drawn in. */
export const STAMP_BOX = 120;
export const WEAR_COUNT = 4;

type Random = () => number;

/** A small seeded generator of numbers in [0, 1): the same seed, the same sequence. */
function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (random: Random, low: number, high: number) =>
  low + random() * (high - low);

/** One decimal is plenty at 120 units, and keeps a texture a few kilobytes. */
const round = (value: number) => Math.round(value * 10) / 10;

/** A corner, kept inside the box: a hole that reaches the edge eats the edge, no further. */
const inside = (value: number) => round(Math.min(Math.max(value, 0), STAMP_BOX));

const point = (x: number, y: number) => `${inside(x)} ${inside(y)}`;

/** A closed irregular polygon of `corners` round a centre: a speck, a chip or a blotch. */
function blob(random: Random, radius: number, corners: number): string {
  const cx = between(random, 0, STAMP_BOX);
  const cy = between(random, 0, STAMP_BOX);
  const turn = random() * Math.PI * 2;
  const vertices = Array.from({ length: corners }, (_, index) => {
    const angle = turn + (index / corners) * Math.PI * 2 + between(random, -0.3, 0.3);
    const reach = radius * between(random, 0.6, 1.2);
    return point(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach);
  });
  return `M${vertices.join('L')}Z`;
}

/** A thin sliver: a scratch of the plate, `length` long and a few tenths wide. */
function scratch(random: Random): string {
  const x = between(random, 0, STAMP_BOX);
  const y = between(random, 0, STAMP_BOX);
  const angle = random() * Math.PI;
  const length = between(random, 10, 26);
  const half = between(random, 0.25, 0.5);
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  const [nx, ny] = [-dy * half, dx * half];
  const [ex, ey] = [x + dx * length, y + dy * length];
  const corners = [
    point(x + nx, y + ny),
    point(ex + nx, ey + ny),
    point(ex - nx, ey - ny),
    point(x - nx, y - ny),
  ];
  return `M${corners.join('L')}Z`;
}

const SPECKS = 130;
const CHIPS = 26;
const BLOTCHES = 7;
const SCRATCHES = 5;

function cut(random: Random): string[] {
  return [
    ...Array.from({ length: SPECKS }, () => blob(random, between(random, 0.45, 1.15), 5)),
    ...Array.from({ length: CHIPS }, () => blob(random, between(random, 1.2, 2.5), 6)),
    ...Array.from({ length: BLOTCHES }, () => blob(random, between(random, 3, 5.2), 7)),
    ...Array.from({ length: SCRATCHES }, () => scratch(random)),
  ];
}

const BOX = `M0 0H${STAMP_BOX}V${STAMP_BOX}H0Z`;

const cache = new Map<StampWear, string>();

/**
 * The texture `wear` (0 to 3) as path data: the whole box, then the holes. Fill it with
 * `fillRule="evenodd"` inside a `<Mask>` and the ink shows everywhere but in the holes.
 */
export function wearPath(wear: StampWear): string {
  const known = cache.get(wear);
  if (known !== undefined) return known;
  const holes = cut(mulberry32(fnv1a32(`stamp-wear-${wear}`)));
  const path = `${BOX}${holes.join('')}`;
  cache.set(wear, path);
  return path;
}
