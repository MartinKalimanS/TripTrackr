/**
 * T422 - FR-021, FR-035, contract C4-8 and C4-10 rule 2. Lists and cards show
 * placeholders shaped like their content while loading, and a screen reader hears ONE
 * busy region, not a dozen anonymous boxes.
 *
 * The kit's Skeleton and SkeletonGroup are plain host views under Jest, so what is
 * asserted is the accessibility contract on the region and the structure and semantic
 * classes of the shapes, never the shimmer. That the shimmer stops under reduced motion
 * is the provider's job (`animation: 'disable-all'`, research D4-05) and a device check.
 */
import { render, screen } from '@testing-library/react-native';
import type { JsonElement, JsonNode } from 'test-renderer';

import { ListSkeleton, RowSkeleton, TripCardSkeleton } from './state-view';

const classesIn = (node: JsonElement) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const root = () => screen.toJSON() as JsonElement;
const elementsOf = (nodes: JsonNode[] | undefined) =>
  (nodes ?? []).filter((node): node is JsonElement => typeof node !== 'string');
const flatten = (node: JsonElement): JsonElement[] => [
  node,
  ...elementsOf(node.children).flatMap(flatten),
];
/** The hidden wrapper inside the region: everything visual lives in it. */
const shapes = () => elementsOf(root().children)[0];
/** A bone is a childless placeholder box. */
const bonesIn = (node: JsonElement) =>
  flatten(node).filter((n) => n !== node && elementsOf(n.children).length === 0);

type Words = { label?: string };
const ALL: [string, (words?: Words) => React.ReactElement][] = [
  ['TripCardSkeleton', (w) => <TripCardSkeleton testID="sk" {...w} />],
  ['RowSkeleton', (w) => <RowSkeleton testID="sk" {...w} />],
  ['ListSkeleton (card)', (w) => <ListSkeleton variant="card" testID="sk" {...w} />],
  ['ListSkeleton (row)', (w) => <ListSkeleton variant="row" testID="sk" {...w} />],
];

describe.each(ALL)('%s - one busy region (FR-035)', (_name, view) => {
  test('is a focusable progressbar named "Loading" by default', async () => {
    await render(view());
    const region = screen.getByTestId('sk');
    expect(region.props.accessible).toBe(true);
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(region.props.accessibilityLabel).toBe('Loading');
    expect(screen.getByLabelText('Loading')).toBe(region);
  });

  test('announces exactly one region, whatever the number of shapes', async () => {
    await render(view());
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  test('hides every shape from assistive technology', async () => {
    await render(view());
    const wrapper = shapes();
    expect(wrapper.props.accessibilityElementsHidden).toBe(true);
    expect(wrapper.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(bonesIn(wrapper).length).toBeGreaterThanOrEqual(3);
    for (const bone of bonesIn(wrapper)) {
      expect(bone.props.accessible).toBeUndefined();
      expect(bone.props.accessibilityRole).toBeUndefined();
    }
  });

  test('takes the screen\u2019s own words for what is loading', async () => {
    await render(view({ label: 'Loading trips' }));
    expect(screen.getByLabelText('Loading trips').props.accessibilityRole).toBe(
      'progressbar',
    );
  });

  test('colours come from semantic classes only', async () => {
    await render(view());
    const all = flatten(root()).flatMap(classesIn);
    expect(all.some((name) => /\[#|rgb|hsl/.test(name))).toBe(false);
  });
});

describe('<TripCardSkeleton> - shaped like a trip card', () => {
  test('a flat card holding a cover, a title and two lines of detail', async () => {
    await render(<TripCardSkeleton />);
    const card = elementsOf(shapes().children)[0];
    expect(classesIn(card)).toEqual(
      expect.arrayContaining(['flex-row', 'items-center', 'bg-surface', 'rounded-2xl']),
    );
    expect(bonesIn(card)).toHaveLength(4);
  });

  test('is one card, and a card never contains a card', async () => {
    await render(<TripCardSkeleton />);
    expect(elementsOf(shapes().children)).toHaveLength(1);
    const surfaces = flatten(shapes()).filter((n) => classesIn(n).includes('bg-surface'));
    expect(surfaces).toHaveLength(1);
  });
});

describe('<RowSkeleton> - shaped like a list row', () => {
  test('a leading shape beside two lines, with no card fill', async () => {
    await render(<RowSkeleton />);
    const row = elementsOf(shapes().children)[0];
    expect(classesIn(row)).toEqual(expect.arrayContaining(['flex-row', 'items-center']));
    expect(classesIn(row)).not.toContain('bg-surface');
    expect(bonesIn(row)).toHaveLength(3);
  });
});

describe('<ListSkeleton> - FR-021', () => {
  test('shows three rows unless asked', async () => {
    await render(<ListSkeleton variant="card" />);
    expect(elementsOf(shapes().children)).toHaveLength(3);
  });

  test.each([
    [5, 5],
    [1, 1],
    [0, 0],
    [2.9, 2],
    [-4, 0],
    [Number.NaN, 3],
  ])('rows=%s draws %s', async (rows, drawn) => {
    await render(<ListSkeleton variant="row" rows={rows} />);
    expect(elementsOf(shapes().children)).toHaveLength(drawn);
  });

  test('the card variant draws a trip card per row', async () => {
    await render(<ListSkeleton variant="card" rows={2} />);
    const rows = elementsOf(shapes().children);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(classesIn(row)).toContain('bg-surface');
  });

  test('the row variant draws a plain list row per row', async () => {
    await render(<ListSkeleton variant="row" rows={2} />);
    const rows = elementsOf(shapes().children);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(classesIn(row)).not.toContain('bg-surface');
  });

  test('keeps one region even for an empty list of rows', async () => {
    await render(<ListSkeleton variant="card" rows={0} testID="sk" />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });
});
