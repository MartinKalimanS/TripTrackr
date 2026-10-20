/**
 * F3 objective 1 - the iOS pill against the pictures (`home.png`, `home-dark.png`,
 * `trips-dark.png`, `home-contrast.png`, `home-scale2.png`; prototype CSS `.tabbar`, `.tab`,
 * `.tabbar-fade`; UI-SPEC 2.4 and 3.7; FR-022 to FR-024).
 *
 * `tab-bar.test.tsx` pins the behaviour of the bar (ids, press, geometry, spring) and
 * `tab-surface.test.tsx` the choice of surface; this file pins what the PICTURES show and the
 * first two did not: the three glyphs, the label's 12 / 14 semibold at every state, the
 * selected capsule in each theme (coral tint; white at 14 percent in the dark themes), the
 * tint of the pill per theme (the cream of the dark theme, not its paper), the ring and the
 * lift on every surface, the fade's ground in the dark themes, and the selection haptic.
 *
 * Colours are read from the real generated stylesheet (`mockThemeColors`), so a token pointed
 * at the wrong palette key fails here.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform, StyleSheet } from 'react-native';

import { TabBar } from '@/components/navigation/tab-bar';
import { PillMetrics } from '@/components/navigation/tab-metrics';
import { tabTint } from '@/components/navigation/tab-surface';
import { TAB_ICONS } from '@/components/navigation/tab-shared';
import { Palettes, Radii, withAlpha, type PaletteName } from '@/theme';

import { appearanceOf } from '../helpers/appearance';
import { glyphsIn } from '../helpers/icons';
import { mockThemeColors } from '../helpers/theme-colors';

jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-haptics');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock;
};
const glassModule = jest.requireMock('expo-glass-effect') as {
  isLiquidGlassAvailable: jest.Mock;
  isGlassEffectAPIAvailable: jest.Mock;
};

const ROUTES = [
  { key: 'index-1', name: 'index', title: 'Globe' },
  { key: 'trips-1', name: 'trips', title: 'Trips' },
  { key: 'profile-1', name: 'profile', title: 'You' },
] as const;

function makeProps(focusedIndex = 0): BottomTabBarProps {
  const emit = jest.fn(() => ({ defaultPrevented: false }));
  const navigate = jest.fn();
  return {
    state: {
      key: 'tabs',
      index: focusedIndex,
      routeNames: ROUTES.map((r) => r.name),
      routes: ROUTES.map((r) => ({ key: r.key, name: r.name })),
      type: 'tab',
      stale: false,
      history: [],
      preloadedRouteKeys: [],
    },
    descriptors: Object.fromEntries(
      ROUTES.map((r) => [
        r.key,
        { options: { title: r.title }, route: { key: r.key, name: r.name } },
      ]),
    ),
    navigation: { emit, navigate },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
  } as unknown as BottomTabBarProps;
}

const tabTap = jest.fn();

function setup(
  theme: PaletteName,
  options: { glass?: boolean; lessTransparency?: boolean } = {},
) {
  const { glass = false, lessTransparency = false } = options;
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue('18.0');
  glassModule.isLiquidGlassAvailable.mockReturnValue(glass);
  glassModule.isGlassEffectAPIAvailable.mockReturnValue(glass);
  useAppearance.mockReturnValue(
    appearanceOf(theme, { prefersLessTransparency: lessTransparency }),
  );
  mockThemeColors(theme);
}

beforeEach(() => {
  tabTap.mockClear();
  useHaptics.mockReturnValue({ tabChange: tabTap });
  setup('light');
});
afterEach(() => {
  jest.restoreAllMocks();
  glassModule.isLiquidGlassAvailable.mockReturnValue(false);
  glassModule.isGlassEffectAPIAvailable.mockReturnValue(false);
});

type Node = { props: Record<string, unknown> };
const styleOf = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
const classesOf = (node: Node) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const HIDDEN = { includeHiddenElements: true } as const;
const byId = (id: string | RegExp) => screen.getByTestId(id, HIDDEN) as unknown as Node;
const THEMES: readonly PaletteName[] = [
  'light',
  'dark',
  'light-contrast',
  'dark-contrast',
];
const lower = (colour: string) => colour.toLowerCase();

describe('the glyphs of the pictures (home.png, trips-dark.png)', () => {
  test('are a globe, a rolling suitcase and a person, 24 dp', async () => {
    expect(TAB_ICONS).toEqual({
      index: 'globe',
      trips: 'suitcase-rolling',
      profile: 'user',
    });
    await render(<TabBar {...makeProps(1)} />);
    expect(glyphsIn().map((g) => [g.name, g.size])).toEqual([
      ['globe', PillMetrics.iconSize],
      ['suitcase-rolling', PillMetrics.iconSize],
      ['user', PillMetrics.iconSize],
    ]);
    expect(PillMetrics.iconSize).toBe(24);
  });
});

describe('the label: 12 / 14, weight 600 selected or not, capped at 1.3', () => {
  test.each([0, 1, 2])(
    'every label is DM Sans 600 at 12 / 14 (tab %i focused)',
    async (i) => {
      await render(<TabBar {...makeProps(i)} />);

      for (const route of ROUTES) {
        const label = screen.getByText(route.title);
        expect(styleOf(label)).toMatchObject({ fontSize: 12, lineHeight: 14 });
        expect(classesOf(label)).toContain('font-body-semibold');
        expect(label.props.maxFontSizeMultiplier).toBe(1.3);
      }
      expect(PillMetrics.labelSize).toBe(12);
      expect(PillMetrics.labelLine).toBe(14);
    },
  );

  test('is the ink when selected and the muted ink when not', async () => {
    await render(<TabBar {...makeProps(2)} />);
    expect(classesOf(screen.getByText('You'))).toContain('text-foreground');
    expect(classesOf(screen.getByText('Globe'))).toContain('text-muted');
    expect(classesOf(screen.getByText('Trips'))).toContain('text-muted');
  });

  test('is 2 dp under a 24 dp glyph, centred in a tab of at least 52 dp', async () => {
    await render(<TabBar {...makeProps(0)} />);
    expect(PillMetrics.iconLabelGap).toBe(2);
    for (const tab of screen.getAllByRole('tab')) {
      expect(styleOf(tab)).toMatchObject({
        gap: 2,
        justifyContent: 'center',
        minHeight: 52,
      });
    }
  });
});

describe('the selected capsule per theme (.tab.is-on)', () => {
  test.each(['light', 'light-contrast'] as const)(
    'is the coral tint in %s',
    async (theme) => {
      setup(theme);
      await render(<TabBar {...makeProps(0)} />);
      expect(styleOf(byId(/^tab-mark-/)).backgroundColor).toBe(
        lower(Palettes[theme].accentTint),
      );
    },
  );

  test.each(['dark', 'dark-contrast'] as const)(
    'is white at 14 percent in %s (the picture, not the coral tint)',
    async (theme) => {
      setup(theme);
      await render(<TabBar {...makeProps(1)} />);
      expect(styleOf(byId(/^tab-mark-/)).backgroundColor).toBe(
        withAlpha(Palettes[theme].onPhoto, 0.14),
      );
      expect(withAlpha('#FFFFFF', 0.14)).toBe('#FFFFFF24');
    },
  );
});

describe('the surface per theme (.tabbar)', () => {
  test.each([
    ['light', 'surface'],
    ['dark', 'surfaceSecondary'],
  ] as const)('the blur tint in %s is the %s at 84 percent', async (theme, key) => {
    setup(theme);
    await render(<TabBar {...makeProps()} />);
    expect(styleOf(byId('tab-surface-tint')).backgroundColor).toBe(
      withAlpha(Palettes[theme][key], 0.84),
    );
  });

  test('dark is the cream (24, 46, 74) of the picture, lighter than the ground', () => {
    expect(Palettes.dark.surfaceSecondary).toBe('#182E4A');
    expect(THEMES.map((theme) => [theme, tabTint(theme)])).toEqual([
      ['light', 'surface'],
      ['dark', 'surfaceSecondary'],
      ['light-contrast', 'surface'],
      ['dark-contrast', 'surface'],
    ]);
  });

  test.each([
    ['light', 'surface'],
    ['dark', 'surfaceSecondary'],
    ['light-contrast', 'surface'],
    ['dark-contrast', 'surface'],
  ] as const)('reduced transparency in %s: opaque %s', async (theme, key) => {
    setup(theme, { glass: true, lessTransparency: true });
    await render(<TabBar {...makeProps()} />);
    const style = styleOf(byId('tab-surface-solid'));
    expect(style.backgroundColor).toBe(lower(Palettes[theme][key]));
    expect(style.opacity).toBeUndefined();
  });

  test.each(['light-contrast', 'dark-contrast'] as const)(
    'in %s the pill is opaque paper with the explicit ring, never glass or blur',
    async (theme) => {
      setup(theme, { glass: true });
      await render(<TabBar {...makeProps()} />);
      const style = styleOf(byId('tab-surface-solid'));
      expect(style.backgroundColor).toBe(lower(Palettes[theme].surface));
      expect(style.borderColor).toBe(lower(Palettes[theme].hairline));
      expect(screen.queryByTestId('tab-surface-glass', HIDDEN)).toBeNull();
      expect(screen.queryByTestId('tab-surface-blur', HIDDEN)).toBeNull();
    },
  );

  test.each(THEMES)(
    'the surface has the hairline ring and lift2 on glass, blur and solid (%s)',
    async (theme) => {
      for (const options of [{ glass: true }, {}, { lessTransparency: true }]) {
        setup(theme, options);
        const { unmount } = await render(<TabBar {...makeProps()} />);
        const surface = byId(/^tab-surface-(glass|blur|solid)$/);
        const style = styleOf(surface);
        expect(style.borderWidth).toBe(StyleSheet.hairlineWidth);
        expect(style.borderColor).toBe(lower(Palettes[theme].hairline));
        expect(style.boxShadow).toBeDefined();
        expect(style.opacity).toBeUndefined();
        await unmount();
      }
    },
  );

  test('a plain capsule: radius full, 64 dp minimum, padding 6, gap 4, 16 and 24 dp out', async () => {
    await render(<TabBar {...makeProps()} />);
    expect(styleOf(byId(/^tab-surface-(glass|blur|solid)$/))).toMatchObject({
      borderRadius: Radii.full,
      minHeight: 64,
      padding: 6,
      gap: 4,
    });
    expect(styleOf(byId('tab-bar'))).toMatchObject({ left: 16, right: 16, bottom: 24 });
  });
});

describe('the fade of the ground (.tabbar-fade)', () => {
  const ground = () => {
    const [layer] = styleOf(byId('tab-fade')).experimental_backgroundImage as {
      colorStops: { color: string }[];
    }[];
    return layer.colorStops;
  };

  test.each(['dark', 'dark-contrast'] as const)(
    'in %s it ends opaque on the sheet surface over Home and the canvas elsewhere',
    async (theme) => {
      setup(theme);
      await render(<TabBar {...makeProps(0)} />);
      expect(ground()[1]!.color).toBe(Palettes[theme].surface.toUpperCase());
      expect(ground()[0]!.color).toBe(withAlpha(Palettes[theme].surface, 0));
      await render(<TabBar {...makeProps(2)} />);
      expect(ground()[1]!.color).toBe(Palettes[theme].canvas.toUpperCase());
    },
  );
});

describe('the selection haptic', () => {
  test('a press that changes the tab plays tabChange once', async () => {
    await render(<TabBar {...makeProps(0)} />);
    await fireEvent.press(screen.getByLabelText('Trips'));
    expect(tabTap).toHaveBeenCalledTimes(1);
  });

  test('a press on the focused tab plays nothing', async () => {
    await render(<TabBar {...makeProps(1)} />);
    await fireEvent.press(screen.getByLabelText('Trips'));
    expect(tabTap).not.toHaveBeenCalled();
  });

  test('a press a listener vetoes plays nothing', async () => {
    const props = makeProps(0);
    (props.navigation.emit as jest.Mock).mockReturnValue({ defaultPrevented: true });
    await render(<TabBar {...props} />);
    await fireEvent.press(screen.getByLabelText('Trips'));
    expect(tabTap).not.toHaveBeenCalled();
  });
});
