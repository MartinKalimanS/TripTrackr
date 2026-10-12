/**
 * T541 - what `ListScreen` gained for a MIXED list (feature 005; contract C5-32 "Trips"; FR-024,
 * FR-030, FR-035): `getItemType` (a recycler reuses a cell only for the same shape), sticky
 * header indices (the year headers), a ref (to jump to a year), viewability callbacks (to follow
 * the scroll), room at the foot for a floating pill and button, the screen margin, and a gap of
 * its own (or none, where the items space themselves).
 *
 * All of it is additive: with none of these props the list is what it was
 * (`list-screen.test.tsx` pins that). `FlashList` is replaced here by a function that records the
 * props it was given, so the props that reach the list are read as they are.
 */
import { render, screen } from '@testing-library/react-native';
import { createRef, type Ref } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { ListScreen } from './list-screen';

const mockSeen: { props: Record<string, unknown> | null } = { props: null };

jest.mock('@shopify/flash-list', () => {
  const { View: MockView } = require('react-native') as typeof import('react-native');
  const MockReact = require('react') as typeof import('react');
  return {
    FlashList: (props: Record<string, unknown>) => {
      mockSeen.props = props;
      return MockReact.createElement(MockView, { testID: 'flash-list' });
    },
  };
});
jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

beforeEach(() => {
  mockSeen.props = null;
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
  } as AppearanceContext);
});

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

const items = ['a', 'b'];

async function renderList(extra: Record<string, unknown> = {}) {
  await render(
    <ListScreen<string>
      data={items}
      keyExtractor={(item) => item}
      renderItem={({ item }) => <Text>{item}</Text>}
      edges={[]}
      {...extra}
    />,
  );
  return mockSeen.props as Record<string, unknown>;
}

describe('<ListScreen> for a mixed list', () => {
  test('hands the item type to the list, so cells are recycled by shape', async () => {
    const getItemType = jest.fn((item: string) => `type-${item}`);
    const props = await renderList({ getItemType });

    expect(props.getItemType).toBe(getItemType);
  });

  test('hands the sticky header indices to the list', async () => {
    const props = await renderList({ stickyHeaderIndices: [2, 5] });
    expect(props.stickyHeaderIndices).toEqual([2, 5]);
  });

  test('hands its ref to the list, so a screen can scroll it', async () => {
    const listRef = createRef<unknown>() as Ref<never>;
    const props = await renderList({ listRef });
    expect(props.ref).toBe(listRef);
  });

  test('hands the viewability callback and its configuration to the list', async () => {
    const onViewableItemsChanged = jest.fn();
    const viewabilityConfig = { itemVisiblePercentThreshold: 50 };
    const props = await renderList({ onViewableItemsChanged, viewabilityConfig });

    expect(props.onViewableItemsChanged).toBe(onViewableItemsChanged);
    expect(props.viewabilityConfig).toBe(viewabilityConfig);
  });

  test('adds room at the foot, past a floating pill and button, to the content', async () => {
    const props = await renderList({ bottomInset: 120 });
    expect(flat(props.contentContainerStyle).paddingBottom).toBe(Spacing.four + 120);
  });

  test('takes a screen margin of its own for the sides', async () => {
    const props = await renderList({ horizontalInset: 20 });
    expect(flat(props.contentContainerStyle).paddingHorizontal).toBe(20);
  });

  test('draws no gap between items when the items space themselves', async () => {
    const props = await renderList({ itemGap: 0 });
    expect(props.ItemSeparatorComponent).toBeUndefined();
  });

  test('draws the gap it was given between items', async () => {
    const props = await renderList({ itemGap: 12 });
    const Separator = props.ItemSeparatorComponent as () => React.ReactElement;
    await render(<Separator />);
    // The separator is a plain view of that height.
    const json = screen.toJSON() as unknown as { props: { style: unknown } };
    expect(flat(json.props.style).height).toBe(12);
  });
});

describe('<ListScreen> without them is what it was', () => {
  test('keeps the 16 dp gap, the 24 dp margin and the 24 dp foot', async () => {
    const props = await renderList();

    expect(props.getItemType).toBeUndefined();
    expect(props.stickyHeaderIndices).toBeUndefined();
    expect(props.ref).toBeUndefined();
    expect(props.onViewableItemsChanged).toBeUndefined();
    expect(flat(props.contentContainerStyle)).toMatchObject({
      paddingHorizontal: Spacing.four,
      paddingBottom: Spacing.four,
    });
    const Separator = props.ItemSeparatorComponent as () => React.ReactElement;
    await render(<Separator />);
    const json = screen.toJSON() as unknown as { props: { style: unknown } };
    expect(flat(json.props.style).height).toBe(Spacing.three);
  });
});
