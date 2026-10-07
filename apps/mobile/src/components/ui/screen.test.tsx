/**
 * T424 - contract C4-8 (`Screen`), C4-10 rules 1 and 5, FR-029, research D4-06.
 *
 * `Screen` is shared by every screen, migrated or not, so the first half pins what must
 * NOT change (testID, edges, max width, `keyboardShouldPersistTaps`, the scroll
 * container); the second half is the opt-in `underHeader` mode for a screen below a
 * native stack header.
 *
 * React Native Testing Library 14 queries host nodes only, so the scroll container and the
 * safe-area section are read from the rendered tree: `RCTScrollView` (a plain
 * `ScrollView`, and the keyboard library's double, which also carries `bottomOffset`) and
 * `RNCSafeAreaView`, whose `edges` arrive as `{ top, right, bottom, left }` modes.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { SCREEN_GUTTER, Screen } from './screen';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    elevationProfile: 'flat',
    tokens: Colors.light,
    ...overrides,
  } as AppearanceContext);
}

beforeEach(() => mockAppearance());

interface Json {
  type: string;
  props: Record<string, unknown>;
  children: (Json | string)[] | null;
}

/** Every rendered node of one host type, in tree order. */
function hostsOf(
  type: string,
  node: Json | Json[] | null = screen.toJSON() as Json,
): Json[] {
  if (node === null) return [];
  if (Array.isArray(node)) return node.flatMap((child) => hostsOf(type, child));
  const below = (node.children ?? []).flatMap((child) =>
    typeof child === 'string' ? [] : hostsOf(type, child),
  );
  return node.type === type ? [node, ...below] : below;
}

const scroller = () => hostsOf('RCTScrollView')[0];
const section = () => hostsOf('RNCSafeAreaView')[0];
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

/** The edges a safe-area section pads, from the modes the native view is given. */
function paddedEdges(node: Json): string[] {
  const modes = node.props.edges as Record<string, string>;
  return Object.keys(modes).filter((edge) => modes[edge] !== 'off');
}

const body = <Text>Body</Text>;

describe('<Screen> as it is today - nothing may regress', () => {
  test('forwards testID to the canvas and renders its children', async () => {
    await render(<Screen testID="trip-screen">{body}</Screen>);
    expect(screen.getByTestId('trip-screen')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  test('paints the canvas with the token style AND the semantic background class', async () => {
    await render(<Screen testID="s">{body}</Screen>);
    const canvas = screen.getByTestId('s');
    expect(flat(canvas.props.style)).toMatchObject({
      backgroundColor: Colors.light.canvas,
      flex: 1,
    });
    expect(tokens(canvas.props.className)).toContain('bg-background');
  });

  test('the canvas follows the theme the appearance hook resolves', async () => {
    mockAppearance({ theme: 'dark', tokens: Colors.dark });
    await render(<Screen testID="s">{body}</Screen>);
    expect(flat(screen.getByTestId('s').props.style).backgroundColor).toBe(
      Colors.dark.canvas,
    );
  });

  test('pads the top and bottom safe area by default', async () => {
    await render(<Screen>{body}</Screen>);
    expect(paddedEdges(section())).toEqual(['top', 'bottom']);
  });

  test('honours the edges it is given, however few', async () => {
    await render(<Screen edges={['bottom']}>{body}</Screen>);
    expect(paddedEdges(section())).toEqual(['bottom']);
    await render(<Screen edges={[]}>{body}</Screen>);
    expect(paddedEdges(hostsOf('RNCSafeAreaView').at(-1) as Json)).toEqual([]);
  });

  test('applies a caller layout style to the safe-area section', async () => {
    await render(<Screen style={{ justifyContent: 'center' }}>{body}</Screen>);
    expect(flat(section().props.style)).toMatchObject({
      justifyContent: 'center',
      paddingHorizontal: Spacing.four,
    });
  });

  test('exports its side padding as SCREEN_GUTTER, and pads both sides by exactly that', async () => {
    // A row that bleeds to the screen edge (`marginHorizontal: -SCREEN_GUTTER`) reads this
    // instead of repeating the number, so the two cannot drift apart.
    expect(SCREEN_GUTTER).toBe(Spacing.four);
    for (const props of [{}, { underHeader: true }]) {
      await render(<Screen {...props}>{body}</Screen>);
      expect(flat(section().props.style).paddingHorizontal).toBe(SCREEN_GUTTER);
    }
  });

  test('scrolls, and keeps taps working while the keyboard is up', async () => {
    await render(<Screen>{body}</Screen>);
    expect(scroller().props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroller().props.scrollEnabled).not.toBe(false);
  });

  test('is capped at the maximum content width and centred', async () => {
    await render(<Screen testID="s">{body}</Screen>);
    expect(flat(scroller().props.style)).toMatchObject({
      maxWidth: MaxContentWidth,
      flex: 1,
    });
    expect(flat(screen.getByTestId('s').props.style)).toMatchObject({
      flexDirection: 'row',
      justifyContent: 'center',
    });
  });

  test('does not touch the scroll view insets: only a screen under a header asks', async () => {
    await render(<Screen>{body}</Screen>);
    expect(scroller().props.contentInsetAdjustmentBehavior).toBeUndefined();
  });

  test('uses a plain scroll view unless it is keyboard aware', async () => {
    await render(<Screen>{body}</Screen>);
    expect(scroller().props.bottomOffset).toBeUndefined();
  });
});

describe('<Screen> at the largest text size - FR-029', () => {
  test('content can overflow: the section grows past the viewport and scrolls', async () => {
    mockAppearance({ fontScale: 2 });
    await render(
      <Screen>
        {Array.from({ length: 40 }, (_, index) => (
          <Text key={index}>Line {index}</Text>
        ))}
      </Screen>,
    );
    const style = flat(section().props.style);
    // `flexGrow` fills a short screen; `flexShrink: 0` never squeezes a heading to nothing.
    expect(style).toMatchObject({ flexGrow: 1, flexShrink: 0 });
    expect(style.height).toBeUndefined();
    expect(style.maxHeight).toBeUndefined();
    expect(flat(scroller().props.contentContainerStyle)).toMatchObject({ flexGrow: 1 });
    expect(flat(scroller().props.contentContainerStyle).height).toBeUndefined();
    expect(scroller().props.scrollEnabled).not.toBe(false);
  });

  test('the same holds under a header', async () => {
    mockAppearance({ fontScale: 2 });
    await render(<Screen underHeader>{body}</Screen>);
    const style = flat(section().props.style);
    expect(style).toMatchObject({ flexGrow: 1, flexShrink: 0 });
    expect(style.height).toBeUndefined();
    expect(scroller().props.scrollEnabled).not.toBe(false);
  });
});

describe('<Screen underHeader> - research D4-06, contract C4-9', () => {
  test('lets the header inset the content: automatic, so iOS large titles collapse', async () => {
    await render(<Screen underHeader>{body}</Screen>);
    expect(scroller().props.contentInsetAdjustmentBehavior).toBe('automatic');
  });

  test('pads no top safe area by default, because the header already covers it', async () => {
    await render(<Screen underHeader>{body}</Screen>);
    expect(paddedEdges(section())).toEqual(['bottom']);
  });

  test('explicit edges still win, in either mode', async () => {
    await render(
      <Screen underHeader edges={['top', 'bottom']}>
        {body}
      </Screen>,
    );
    expect(paddedEdges(section())).toEqual(['top', 'bottom']);
    await render(
      <Screen underHeader edges={[]}>
        {body}
      </Screen>,
    );
    expect(paddedEdges(hostsOf('RNCSafeAreaView').at(-1) as Json)).toEqual([]);
  });

  test('keeps the scroll view as the FIRST child of the screen root (iOS large-title linking)', async () => {
    await render(
      <Screen underHeader testID="s">
        {body}
      </Screen>,
    );
    const root = screen.toJSON() as Json;
    expect(root.props.testID).toBe('s');
    expect(root.children).toHaveLength(1);
    expect((root.children?.[0] as Json).type).toBe('RCTScrollView');
  });

  test('keeps testID, max width, the canvas and the keyboard-tap setting', async () => {
    await render(
      <Screen underHeader testID="s" style={{ gap: 4 }}>
        {body}
      </Screen>,
    );
    const canvas = screen.getByTestId('s');
    expect(tokens(canvas.props.className)).toContain('bg-background');
    expect(flat(canvas.props.style).backgroundColor).toBe(Colors.light.canvas);
    expect(scroller().props.keyboardShouldPersistTaps).toBe('handled');
    expect(flat(scroller().props.style)).toMatchObject({ maxWidth: MaxContentWidth });
    expect(flat(section().props.style)).toMatchObject({ gap: 4 });
  });
});

describe('<Screen keyboardAware> - research D-24', () => {
  test('scrolls a focused field above the keyboard, with taps kept', async () => {
    await render(<Screen keyboardAware>{body}</Screen>);
    expect(scroller().props.bottomOffset).toBe(Spacing.four);
    expect(scroller().props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroller().props.contentInsetAdjustmentBehavior).toBeUndefined();
    expect(paddedEdges(section())).toEqual(['top', 'bottom']);
  });

  test('under a header the keyboard-aware scroller insets too, and stays first', async () => {
    await render(
      <Screen keyboardAware underHeader testID="s">
        <View testID="field" />
      </Screen>,
    );
    expect(scroller().props.bottomOffset).toBe(Spacing.four);
    expect(scroller().props.contentInsetAdjustmentBehavior).toBe('automatic');
    expect(scroller().props.keyboardShouldPersistTaps).toBe('handled');
    expect(paddedEdges(section())).toEqual(['bottom']);
    const root = screen.toJSON() as Json;
    expect(root.children).toHaveLength(1);
    expect((root.children?.[0] as Json).type).toBe('RCTScrollView');
    expect(screen.getByTestId('field')).toBeTruthy();
  });
});
