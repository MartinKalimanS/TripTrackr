/**
 * T442 - FR-021, FR-035, contract C4-10 rule 2: a grid shows placeholders shaped like
 * its tiles while it loads, and a screen reader hears ONE busy region, not a dozen
 * anonymous boxes (the `ListSkeleton` rules of `state-skeletons.test.tsx`, for a grid).
 *
 * The kit's Skeleton and SkeletonGroup are plain host views under Jest, so what is
 * asserted is the accessibility contract on the region and the structure and semantic
 * classes of the shapes, never the shimmer.
 */
import { render, screen } from '@testing-library/react-native';
import type { JsonElement, JsonNode } from 'test-renderer';

import { GridSkeleton } from './grid-skeleton';

const elementsOf = (nodes: JsonNode[] | undefined) =>
  (nodes ?? []).filter((node): node is JsonElement => typeof node !== 'string');
const flatten = (node: JsonElement): JsonElement[] => [
  node,
  ...elementsOf(node.children).flatMap(flatten),
];
const classesIn = (node: JsonElement) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const root = () => screen.toJSON() as JsonElement;
/** The hidden wrapper inside the region: everything visual lives in it. */
const shapes = () => elementsOf(root().children)[0] as JsonElement;
const rowsOf = () => elementsOf(shapes().children);
/** A bone is a childless placeholder box. */
const bonesIn = (node: JsonElement) =>
  flatten(node).filter((n) => n !== node && elementsOf(n.children).length === 0);

describe('<GridSkeleton> - one busy region (FR-035)', () => {
  test('is a focusable progressbar named "Loading" by default', async () => {
    await render(<GridSkeleton columns={3} testID="sk" />);
    const region = screen.getByTestId('sk');
    expect(region.props.accessible).toBe(true);
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(region.props.accessibilityLabel).toBe('Loading');
  });

  test('takes the screen’s own words for what is loading', async () => {
    await render(<GridSkeleton columns={3} label="Loading photos" />);
    expect(screen.getByLabelText('Loading photos').props.accessibilityRole).toBe(
      'progressbar',
    );
  });

  test('announces exactly one region, whatever the number of tiles', async () => {
    await render(<GridSkeleton columns={4} rows={5} />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  test('hides every tile from assistive technology', async () => {
    await render(<GridSkeleton columns={3} />);
    const wrapper = shapes();
    expect(wrapper.props.accessibilityElementsHidden).toBe(true);
    expect(wrapper.props.importantForAccessibility).toBe('no-hide-descendants');
    for (const bone of bonesIn(wrapper)) {
      expect(bone.props.accessible).toBeUndefined();
      expect(bone.props.accessibilityRole).toBeUndefined();
    }
  });
});

describe('<GridSkeleton> - shaped like the grid (FR-021)', () => {
  test('draws `columns` square tiles in each of `rows` rows', async () => {
    await render(<GridSkeleton columns={3} rows={2} />);
    expect(rowsOf()).toHaveLength(2);
    for (const row of rowsOf()) {
      expect(classesIn(row)).toContain('flex-row');
      const tiles = elementsOf(row.children);
      expect(tiles).toHaveLength(3);
      for (const tile of tiles) {
        expect(classesIn(tile)).toEqual(
          expect.arrayContaining(['flex-1', 'aspect-square']),
        );
      }
    }
  });

  test('shows three rows unless told otherwise', async () => {
    await render(<GridSkeleton columns={2} />);
    expect(rowsOf()).toHaveLength(3);
  });

  test('a single column is one tile across, as the gallery is at the largest text size', async () => {
    await render(<GridSkeleton columns={1} rows={2} />);
    expect(bonesIn(shapes())).toHaveLength(2);
  });

  test('a fraction is truncated, and nothing below one column or none of a row is drawn', async () => {
    await render(<GridSkeleton columns={2.9} rows={1.5} />);
    expect(rowsOf()).toHaveLength(1);
    expect(bonesIn(shapes())).toHaveLength(2);
  });

  test('a column count below one is one column, a negative row count is none', async () => {
    await render(<GridSkeleton columns={0} rows={-2} />);
    expect(rowsOf()).toHaveLength(0);
    await screen.rerender(<GridSkeleton columns={0} rows={1} />);
    expect(bonesIn(shapes())).toHaveLength(1);
  });

  test('a count that is not a number falls back to one column and the default rows', async () => {
    await render(<GridSkeleton columns={Number.NaN} rows={Number.NaN} />);
    expect(rowsOf()).toHaveLength(3);
    expect(bonesIn(shapes())).toHaveLength(3);
  });

  test('the tiles are spaced as the grid’s own tiles are, a 16 dp gap both ways', async () => {
    await render(<GridSkeleton columns={3} rows={2} />);
    expect(classesIn(shapes())).toContain('gap-4');
    expect(classesIn(rowsOf()[0] as JsonElement)).toContain('gap-4');
  });

  test('colours come from semantic classes only', async () => {
    await render(<GridSkeleton columns={3} />);
    const all = flatten(root()).flatMap(classesIn);
    expect(all.some((name) => /\[#|rgb|hsl/.test(name))).toBe(false);
  });
});
