/**
 * T522 - contract C5-28, screens.md (Trips, Trip, Home states), FR-064, FR-066: the four
 * screen skeletons. Each is shaped from the real geometry of the screen it stands in for,
 * and each is ONE announced `progressbar` region with every shape hidden from assistive
 * technology (the rules of `state-skeletons.test.tsx`).
 *
 * The kit's SkeletonGroup and Item are plain host views under Jest that carry every prop
 * they were given, so what is asserted is the structure, the semantic classes and the
 * accessibility contract on the region, never the shimmer.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { JsonElement, JsonNode } from 'test-renderer';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { anyGlyph, glyphNamesIn } from '../../../test/helpers/icons';
import {
  AreaSkeleton,
  HomeSkeleton,
  TripDetailSkeleton,
  TripListSkeleton,
} from './screen-skeletons';

jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-color-scheme');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const { useColorScheme } = jest.requireMock('@/hooks/use-color-scheme') as {
  useColorScheme: jest.Mock<'light' | 'dark', []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ...overrides,
  } as AppearanceContext);
}

beforeEach(() => {
  mockAppearance();
  useColorScheme.mockReturnValue('light');
});
afterEach(() => jest.restoreAllMocks());

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
/** Every host node under the region whose classes include all of `wanted`. */
const withClasses = (...wanted: string[]) =>
  flatten(shapes()).filter((node) =>
    wanted.every((name) => classesIn(node).includes(name)),
  );
const bones = () => withClasses('bg-skeleton');
const texts = (node: JsonElement): string[] =>
  flatten(node).flatMap(
    (n) => n.children?.filter((c) => typeof c === 'string') ?? [],
  ) as string[];

const ALL: [string, string, string, () => React.ReactElement][] = [
  ['TripListSkeleton', 'trips-skeleton', 'Loading trips', () => <TripListSkeleton />],
  ['TripDetailSkeleton', 'trip-skeleton', 'Loading trip', () => <TripDetailSkeleton />],
  ['AreaSkeleton', 'area-skeleton', 'Loading', () => <AreaSkeleton />],
  ['HomeSkeleton', 'home-skeleton', 'Loading your globe', () => <HomeSkeleton />],
];

describe.each(ALL)('%s - ONE announced region (C5-28)', (_name, id, label, view) => {
  test('is a focusable progressbar with its own id and words', async () => {
    await render(view());
    const region = screen.getByTestId(id);
    expect(region.props.accessible).toBe(true);
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(region.props.accessibilityLabel).toBe(label);
    expect(screen.getByLabelText(label)).toBe(region);
  });

  test('announces exactly one region, whatever the number of shapes', async () => {
    await render(view());
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  test('hides every shape from assistive technology', async () => {
    await render(view());
    expect(shapes().props.accessibilityElementsHidden).toBe(true);
    expect(shapes().props.importantForAccessibility).toBe('no-hide-descendants');
    expect(bones().length).toBeGreaterThanOrEqual(6);
    for (const bone of bones()) {
      expect(bone.props.accessible).toBeUndefined();
      expect(bone.props.accessibilityRole).toBeUndefined();
    }
  });

  test('takes the screen\u2019s own words and id', async () => {
    const { rerender } = await render(view());
    await rerender(
      <>
        {id === 'trips-skeleton' && (
          <TripListSkeleton label="Loading your trips" testID="x" />
        )}
        {id === 'trip-skeleton' && (
          <TripDetailSkeleton label="Loading Lisbon" testID="x" />
        )}
        {id === 'area-skeleton' && <AreaSkeleton label="Loading notes" testID="x" />}
        {id === 'home-skeleton' && <HomeSkeleton label="Loading the globe" testID="x" />}
      </>,
    );
    const region = screen.getByTestId('x');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(region.props.accessibilityLabel).not.toBe(label);
  });

  test('colours come from semantic classes only', async () => {
    await render(view());
    const all = flatten(root()).flatMap(classesIn);
    expect(all.some((name) => /\[#|rgb|hsl/.test(name))).toBe(false);
  });

  test('is still under reduced motion: every group asks for no shimmer', async () => {
    mockAppearance({ prefersLessMotion: true });
    await render(view());
    const groups = flatten(root()).filter((node) => node.props.variant !== undefined);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    for (const group of groups) expect(group.props.variant).toBe('none');
  });

  test('shimmers by default', async () => {
    await render(view());
    const groups = flatten(root()).filter((node) => node.props.variant !== undefined);
    for (const group of groups) expect(group.props.variant).toBe('shimmer');
  });
});

describe('<TripListSkeleton> - a hero, a ticket and rows (screens.md Trips)', () => {
  test('the hero is 16:10 with a 24 dp corner and a pin glyph', async () => {
    await render(<TripListSkeleton />);
    const [hero] = withClasses('aspect-[16/10]', 'rounded-3xl');
    expect(hero).toBeDefined();
    expect(classesIn(hero)).toContain('w-full');
    expect(glyphNamesIn()).toEqual(['map-pin']);
    expect(screen.queryByTestId(anyGlyph)).toBeNull();
  });

  test('the ticket is 96 dp tall with a 24 dp corner', async () => {
    await render(<TripListSkeleton />);
    expect(withClasses('h-24', 'rounded-3xl')).toHaveLength(1);
  });

  // trips-loading.png and the prototype: a 90 dp year line, rows that are 72 dp tall (a 64 dp
  // thumb, a 20 dp line at 60 percent and a 14 dp line at 80 percent), every item 16 dp apart.
  // They were 96 dp, 75 / 50 percent, a 16 dp line and rows 12 dp apart in their own group.
  test('then a year line and three rows, a 64 dp thumb and two lines each', async () => {
    await render(<TripListSkeleton />);
    expect(withClasses('h-5', 'w-[90px]')).toHaveLength(1);
    expect(withClasses('size-16', 'rounded-2xl')).toHaveLength(3);
    expect(withClasses('h-5', 'w-[60%]')).toHaveLength(3);
    expect(withClasses('h-3.5', 'w-[80%]')).toHaveLength(3);
  });

  test('each row is 72 dp tall and the rows are items of the list, 16 dp apart', async () => {
    await render(<TripListSkeleton />);
    const all = flatten(root());
    const rows = all.filter((node) =>
      ['min-h-[72px]', 'flex-row'].every((c) => classesIn(node).includes(c)),
    );
    expect(rows).toHaveLength(3);
    expect(all.filter((node) => classesIn(node).includes('gap-3'))).toHaveLength(0);
    const parent = all.find((node) => node.children?.includes(rows[0]));
    expect(parent).toBeDefined();
    expect(classesIn(parent as JsonElement)).toContain('gap-4');
    expect(elementsOf(parent?.children).filter((c) => rows.includes(c))).toHaveLength(3);
  });

  test.each([
    [5, 5],
    [1, 1],
    [0, 0],
    [2.9, 2],
    [-4, 0],
    [Number.NaN, 3],
  ])('rows=%s draws %s rows', async (rows, drawn) => {
    await render(<TripListSkeleton rows={rows} />);
    expect(withClasses('size-16', 'rounded-2xl')).toHaveLength(drawn);
  });
});

describe('<TripDetailSkeleton> - hero, status, four tiles, day chips, stops', () => {
  test('mirrors the page: hero, a status row, four 72 dp tiles, five day chips', async () => {
    await render(<TripDetailSkeleton />);
    expect(withClasses('min-h-[236px]', 'w-full')).toHaveLength(1);
    expect(withClasses('h-9', 'rounded-full')).toHaveLength(3);
    expect(withClasses('min-h-[72px]', 'rounded-2xl')).toHaveLength(4);
    expect(withClasses('size-14', 'rounded-2xl')).toHaveLength(5 + 3);
  });

  test('then the stops: a node, two lines and a 56 dp thumb, three times', async () => {
    await render(<TripDetailSkeleton />);
    expect(withClasses('size-7', 'rounded-full')).toHaveLength(3);
    expect(withClasses('h-5', 'w-1/2')).toHaveLength(3);
    expect(withClasses('h-4', 'w-3/4')).toHaveLength(3);
  });

  test('the hero can be left out when the screen keeps its own picture', async () => {
    await render(<TripDetailSkeleton hero={false} />);
    expect(withClasses('min-h-[236px]')).toHaveLength(0);
    expect(withClasses('min-h-[72px]', 'rounded-2xl')).toHaveLength(4);
  });

  test('at large text the tiles are two columns, as the areas grid is', async () => {
    mockAppearance({ fontScale: 1.5 });
    await render(<TripDetailSkeleton />);
    expect(withClasses('min-h-[72px]', 'rounded-2xl')).toHaveLength(4);
    const isTile = (node: JsonElement) => classesIn(node).includes('min-h-[72px]');
    const rows = flatten(shapes()).filter((node) => {
      const children = elementsOf(node.children);
      return (
        classesIn(node).includes('flex-row') &&
        children.length > 0 &&
        children.every(isTile)
      );
    });
    expect(rows.map((row) => elementsOf(row.children).length)).toEqual([2, 2]);
  });
});

describe('<AreaSkeleton> - a header and rows (screens.md, the five areas)', () => {
  test('a title and a subtitle, then four rows of a roundel, two lines and an amount', async () => {
    await render(<AreaSkeleton />);
    expect(withClasses('h-7', 'w-1/2')).toHaveLength(1);
    expect(withClasses('size-12', 'rounded-full')).toHaveLength(4);
    expect(withClasses('h-5', 'w-16')).toHaveLength(4);
  });

  test('the row count is the caller\u2019s, with the same rules as a list', async () => {
    await render(<AreaSkeleton rows={2} />);
    expect(withClasses('size-12', 'rounded-full')).toHaveLength(2);
  });
});

describe('<HomeSkeleton> - a disc where the globe will mount, and a sheet', () => {
  test('the disc is as wide as twice the radius the screen computed', async () => {
    await render(<HomeSkeleton discRadius={150} />);
    const [disc] = withClasses('rounded-full', 'bg-skeleton');
    expect(StyleSheet.flatten(disc.props.style)).toMatchObject({
      width: 300,
      height: 300,
    });
  });

  test('the sheet holds a handle, three figures and two rows', async () => {
    await render(<HomeSkeleton />);
    // home-loading.png: a 40 dp numeral bone over a 14 dp label bone, in each of the three columns.
    expect(withClasses('h-10', 'w-2/3', 'rounded-2xl')).toHaveLength(3);
    expect(withClasses('h-3.5', 'w-full', 'rounded-lg')).toHaveLength(3);
    expect(withClasses('size-16', 'rounded-2xl')).toHaveLength(1);
    expect(withClasses('size-12', 'rounded-xl')).toHaveLength(1);
    expect(withClasses('bg-grab', 'rounded-full')).toHaveLength(1);
  });

  test('the sheet is the opaque surface with the second lift and a hairline', async () => {
    await render(<HomeSkeleton />);
    const [sheet] = withClasses('bg-surface', 'border-separator');
    expect(sheet).toBeDefined();
    expect(classesIn(sheet)).not.toContain('bg-surface/80');
    const style = JSON.stringify(sheet.props.style);
    expect(style).toContain('boxShadow');
  });

  test('the sheet is as tall as the half detent it is given, flush with the bottom edge', async () => {
    await render(<HomeSkeleton sheetHeight={439} />);
    const [sheet] = withClasses('bg-surface', 'border-separator');
    expect(classesIn(sheet)).toEqual(expect.arrayContaining(['absolute', 'bottom-0']));
    expect(StyleSheet.flatten(sheet.props.style)).toMatchObject({ height: 439 });
  });

  test('the handle is the 36 by 5 grabber, 10 dp into a 28 dp zone, with 4 dp before the figures', async () => {
    await render(<HomeSkeleton />);
    const [grab] = withClasses('bg-grab', 'rounded-full');
    expect(classesIn(grab)).toEqual(
      expect.arrayContaining(['mt-[10px]', 'h-[5px]', 'w-9']),
    );
    const [zone] = withClasses('h-7', 'items-center');
    expect(elementsOf(zone.children).map(classesIn)).toEqual([
      expect.arrayContaining(['bg-grab']),
    ]);
    const [sheet] = withClasses('bg-surface', 'border-separator');
    expect(classesIn(sheet)).toEqual(expect.arrayContaining(['px-5', 'gap-4']));
    expect(classesIn(sheet)).not.toContain('pt-3');
  });

  test('shows the date of the day over the greeting when it is given one, in place of a bone', async () => {
    await render(<HomeSkeleton greetingName="Marta" greetingDate="WED 14 OCT" />);
    expect(texts(shapes())).toEqual(expect.arrayContaining(['WED 14 OCT']));
    expect(withClasses('h-4', 'w-24')).toHaveLength(0);
  });

  test('says hello with the name from the last session when it has one', async () => {
    await render(<HomeSkeleton greetingName="Marta" />);
    expect(texts(shapes())).toEqual(expect.arrayContaining(['Hello, ', 'Marta']));
  });

  test('has no greeting words until a name is known: a bone stands in', async () => {
    await render(<HomeSkeleton />);
    expect(texts(shapes())).toEqual([]);
    expect(withClasses('h-10', 'w-56')).toHaveLength(1);
  });
});
