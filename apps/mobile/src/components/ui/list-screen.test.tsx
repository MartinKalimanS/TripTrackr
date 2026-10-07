/**
 * T424 - contract C4-8 (`ListScreen`), D-23, FR-029, research D4-06.
 *
 * `ListScreen` is shared by the unmigrated list screens (notes, expenses, photos,
 * documents), so the first half pins what must NOT change: the props, the safe-area
 * padding, header / empty / footer, the canvas. The second half is the opt-in
 * `underHeader` mode for a list below a native stack header. FlashList is its own
 * `RecyclerView` here (jest.setup.ts), whose host scroller is an `RCTScrollView`.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { ListScreen, type ListScreenProps } from './list-screen';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    elevationProfile: 'flat',
    tokens: Colors.light,
  } as AppearanceContext);
});

interface Json {
  type: string;
  props: Record<string, unknown>;
  children: (Json | string)[] | null;
}

/** The first node of one host type, depth first. */
function hostOf(type: string, node: Json | null = screen.toJSON() as Json): Json | null {
  if (node === null) return null;
  if (node.type === type) return node;
  for (const child of node.children ?? []) {
    const found = typeof child === 'string' ? null : hostOf(type, child);
    if (found) return found;
  }
  return null;
}

const scroller = () => hostOf('RCTScrollView') as Json;
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);

const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };

type Row = { id: string; name: string };
const ROWS: Row[] = [
  { id: 'a', name: 'Lisbon' },
  { id: 'b', name: 'Porto' },
];

async function renderList(props: Partial<ListScreenProps<Row>> = {}) {
  await render(
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <ListScreen<Row>
        testID="list"
        data={ROWS}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <Text>{item.name}</Text>}
        {...props}
      />
    </SafeAreaInsetsContext.Provider>,
  );
}

describe('<ListScreen> as it is today - nothing may regress', () => {
  test('forwards testID, renders the rows and keeps taps working', async () => {
    await renderList();
    expect(screen.getByTestId('list')).toBeTruthy();
    expect(screen.getByText('Lisbon')).toBeTruthy();
    expect(screen.getByText('Porto')).toBeTruthy();
    expect(scroller().props.keyboardShouldPersistTaps).toBe('handled');
  });

  test('paints the canvas with the token style AND the semantic background class', async () => {
    await renderList();
    const canvas = screen.getByTestId('list');
    expect(flat(canvas.props.style)).toMatchObject({
      backgroundColor: Colors.light.canvas,
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
    });
    expect(tokens(canvas.props.className)).toContain('bg-background');
  });

  test('pads the top and bottom safe area into the content by default', async () => {
    await renderList();
    expect(flat(scroller().props.contentContainerStyle)).toMatchObject({
      paddingTop: Spacing.four + INSETS.top,
      paddingBottom: Spacing.four + INSETS.bottom,
      paddingHorizontal: Spacing.four,
    });
  });

  test('honours the edges it is given', async () => {
    await renderList({ edges: ['bottom'] });
    expect(flat(scroller().props.contentContainerStyle)).toMatchObject({
      paddingTop: Spacing.four,
      paddingBottom: Spacing.four + INSETS.bottom,
    });
  });

  test('is capped at the maximum content width', async () => {
    await renderList();
    const root = screen.toJSON() as Json;
    const column = root.children?.[0] as Json;
    expect(flat(column.props.style)).toMatchObject({
      flex: 1,
      maxWidth: MaxContentWidth,
    });
  });

  test('header, empty state and footer travel with the list', async () => {
    await renderList({
      header: <Text>Header</Text>,
      footer: <Text>Footer</Text>,
    });
    expect(screen.getByText('Header')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();

    await renderList({ data: [], empty: <Text>Nothing yet</Text> });
    expect(screen.getByText('Nothing yet')).toBeTruthy();
  });

  test('works with no safe-area provider above it (a component test)', async () => {
    await render(
      <ListScreen<Row>
        data={ROWS}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <Text>{item.name}</Text>}
      />,
    );
    expect(flat(scroller().props.contentContainerStyle)).toMatchObject({
      paddingTop: Spacing.four,
      paddingBottom: Spacing.four,
    });
  });

  test('does not touch the scroll view insets: only a list under a header asks', async () => {
    await renderList();
    expect(scroller().props.contentInsetAdjustmentBehavior).toBeUndefined();
  });
});

describe('<ListScreen> at the largest text size - FR-029', () => {
  test('rows have no fixed height and the list scrolls, so content can overflow', async () => {
    useAppearance.mockReturnValue({
      theme: 'light',
      fontScale: 2,
      tokens: Colors.light,
    } as AppearanceContext);
    await renderList({ header: <Text>A header that wraps at the largest text</Text> });
    const content = flat(scroller().props.contentContainerStyle);
    expect(content.height).toBeUndefined();
    expect(content.maxHeight).toBeUndefined();
    expect(scroller().props.scrollEnabled).not.toBe(false);
  });
});

describe('<ListScreen underHeader> - research D4-06, contract C4-9', () => {
  test('lets the header inset the list: automatic, so iOS large titles collapse', async () => {
    await renderList({ underHeader: true });
    expect(scroller().props.contentInsetAdjustmentBehavior).toBe('automatic');
  });

  test('pads no top safe area by default, because the header already covers it', async () => {
    await renderList({ underHeader: true });
    expect(flat(scroller().props.contentContainerStyle)).toMatchObject({
      paddingTop: Spacing.four,
      paddingBottom: Spacing.four + INSETS.bottom,
    });
  });

  test('explicit edges still win', async () => {
    await renderList({ underHeader: true, edges: ['top', 'bottom'] });
    expect(flat(scroller().props.contentContainerStyle)).toMatchObject({
      paddingTop: Spacing.four + INSETS.top,
      paddingBottom: Spacing.four + INSETS.bottom,
    });
    await renderList({ underHeader: true, edges: [] });
    expect(flat(scroller().props.contentContainerStyle)).toMatchObject({
      paddingTop: Spacing.four,
      paddingBottom: Spacing.four,
    });
  });

  test('keeps the scroller first: nothing is rendered before it down the first children', async () => {
    await renderList({ underHeader: true, header: <Text>Header</Text> });
    // react-native-screens walks the first child of each view until it meets a scroll
    // view (`RNSScrollViewFinder`): every wrapper above it must be the only child.
    let node = screen.toJSON() as Json;
    const chain = [node.type];
    while (node.type !== 'RCTScrollView') {
      expect(node.children).toHaveLength(1);
      node = node.children?.[0] as Json;
      chain.push(node.type);
    }
    expect(chain.at(-1)).toBe('RCTScrollView');
    expect(chain.length).toBeLessThanOrEqual(5);
  });

  test('keeps testID, canvas, max width, header, empty state and footer', async () => {
    await renderList({
      underHeader: true,
      data: [],
      header: <Text>Header</Text>,
      empty: <Text>Nothing yet</Text>,
      footer: <Text>Footer</Text>,
    });
    const canvas = screen.getByTestId('list');
    expect(tokens(canvas.props.className)).toContain('bg-background');
    expect(flat(canvas.props.style).backgroundColor).toBe(Colors.light.canvas);
    expect(scroller().props.keyboardShouldPersistTaps).toBe('handled');
    for (const text of ['Header', 'Nothing yet', 'Footer']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });
});
