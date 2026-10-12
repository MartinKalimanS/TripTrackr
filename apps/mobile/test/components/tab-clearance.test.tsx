/**
 * T530 - a scene keeps clear of the floating tab pill (feature 005, FR-024): "nothing is hidden
 * behind the pill; lists end with at least the pill's height plus 16 dp". The two scroll
 * containers every tab scene is built on, `Screen` and `ListScreen`, take the clearance from
 * the navigator (`useTabInset`), so Trips, You and the loading states are clear of the pill
 * without each screen doing the sum. Pushed above the tabs there is no pill and nothing changes:
 * the first half of each pair pins that, so no other screen regresses.
 */
import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { ListScreen } from '@/components/ui/list-screen';
import { Screen, SCREEN_GUTTER } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { TabInsetContext } from '@/hooks/tab-inset-context';

import { appearanceOf } from '../helpers/appearance';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
beforeEach(() => useAppearance.mockReturnValue(appearanceOf('light')));

interface Json {
  type: string;
  props: Record<string, unknown>;
  children: (Json | string)[] | null;
}

function find(predicate: (node: Json) => boolean, node: Json | null): Json | null {
  if (node === null) return null;
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const found = typeof child === 'string' ? null : find(predicate, child);
    if (found) return found;
  }
  return null;
}

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

/** The padded column of a `Screen`: the node that carries the screen gutter. */
const screenColumn = () =>
  flat(
    find(
      (node) => flat(node.props.style).paddingHorizontal === SCREEN_GUTTER,
      screen.toJSON() as Json,
    )?.props.style,
  );

const listContent = () =>
  flat(
    find((node) => node.type === 'RCTScrollView', screen.toJSON() as Json)?.props
      .contentContainerStyle,
  );

const inTabs = (height: number, children: ReactNode) => (
  <TabInsetContext.Provider value={height}>{children}</TabInsetContext.Provider>
);

const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };

describe('<Screen> in a tab scene', () => {
  test('outside the tabs nothing changes: the padding it always had', async () => {
    await render(
      <Screen testID="s">
        <Text>body</Text>
      </Screen>,
    );
    expect(screenColumn()).toMatchObject({ paddingVertical: Spacing.four });
    expect(screenColumn().paddingBottom).toBeUndefined();
  });

  test('inside the tabs it ends 16 dp above the pill: the height the pill reported plus 16', async () => {
    await render(
      inTabs(
        88,
        <Screen testID="s" edges={[]}>
          <Text>body</Text>
        </Screen>,
      ),
    );
    expect(screenColumn().paddingBottom).toBe(88 + 16);
  });

  test('never ends closer than its own bottom padding, and grows with a pill that grew', async () => {
    await render(
      inTabs(
        140,
        <Screen testID="s" edges={[]}>
          <Text>body</Text>
        </Screen>,
      ),
    );
    expect(screenColumn().paddingBottom).toBe(156);
  });
});

describe('<ListScreen> in a tab scene', () => {
  const data = ['a', 'b'];
  const list = (
    <ListScreen
      testID="l"
      data={data}
      keyExtractor={(item) => item}
      renderItem={({ item }) => <Text>{item}</Text>}
    />
  );

  test('outside the tabs nothing changes: its padding and the safe-area inset', async () => {
    await render(
      <SafeAreaInsetsContext.Provider value={INSETS}>
        {list}
      </SafeAreaInsetsContext.Provider>,
    );
    expect(listContent().paddingBottom).toBe(Spacing.four + INSETS.bottom);
  });

  test('inside the tabs the list ends 16 dp above the pill, past the home-indicator inset', async () => {
    await render(
      <SafeAreaInsetsContext.Provider value={INSETS}>
        {inTabs(88, list)}
      </SafeAreaInsetsContext.Provider>,
    );
    expect(listContent().paddingBottom).toBe(88 + 16);
  });

  test('keeps its own padding when that is already more than the pill needs', async () => {
    await render(
      <SafeAreaInsetsContext.Provider value={{ ...INSETS, bottom: 200 }}>
        {inTabs(88, list)}
      </SafeAreaInsetsContext.Provider>,
    );
    expect(listContent().paddingBottom).toBe(Spacing.four + 200);
  });
});
