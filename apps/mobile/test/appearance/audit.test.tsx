/**
 * T562 - the audit can fail (feature 005; FR-072, FR-073, SC-008). A sweep that never reports
 * anything proves nothing, so each thing the audit looks for is shown here on a tree that has
 * it: a raw colour, a colour of another theme, a translucent background, a blur, a glass
 * effect, a foreign shadow; and each thing it must let through (a token, `transparent`, a lift,
 * the documented exceptions). The last tests run it on the real tab pill, which IS translucent
 * (blur, glass) until the traveller asks for less.
 */
import { screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { TabBar } from '@/components/navigation/tab-bar';
import { Palettes, liftOf, type PaletteName } from '@/theme';

import { audit, type HostNode } from './audit';
import { TRANSLUCENT } from './allow-list';
import { parseColour, tokenRgbOf } from './colours';
import { auditNow, installThemeAwareKit, renderIn } from './sweep';
import { tabBarProps } from './tab-bar-props';

const view = (props: Record<string, unknown>, type = 'View'): HostNode => ({
  type,
  props,
  children: null,
});
const paint = (style: Record<string, unknown>) => view({ style });
const kinds = (tree: HostNode, theme: PaletteName, opaque: boolean) =>
  audit(tree, { theme, opaque }).map((finding) => finding.kind);

describe('the colours (FR-078, FR-079)', () => {
  test('a token of the theme passes, whatever its opacity', () => {
    const { surface, hairline } = Palettes.dark;
    expect(kinds(paint({ backgroundColor: surface }), 'dark', false)).toEqual([]);
    expect(kinds(paint({ borderColor: hairline }), 'dark', false)).toEqual([]);
  });

  test('transparent and none are not colours', () => {
    expect(kinds(paint({ backgroundColor: 'transparent' }), 'light', true)).toEqual([]);
    expect(kinds(view({ fill: 'none' }), 'light', true)).toEqual([]);
  });

  test('a raw literal is reported, in a style and in a colour prop', () => {
    expect(kinds(paint({ color: '#123456' }), 'light', false)).toEqual(['literal']);
    expect(kinds(view({ fill: '#123456' }, 'Path'), 'light', false)).toEqual(['literal']);
    expect(kinds(view({ stroke: 'white' }, 'Path'), 'light', false)).toEqual(['literal']);
    expect(kinds(paint({ color: 'rebeccapurple' }), 'light', false)).toEqual(['literal']);
  });

  test('a colour of ANOTHER theme is a literal: a screen left in the previous theme', () => {
    const dark = tokenRgbOf('dark');
    const onlyLight = Object.values(Palettes.light).find((value) => {
      const rgba = parseColour(value);
      return rgba !== null && !dark.has(`${rgba.r},${rgba.g},${rgba.b}`);
    });
    expect(onlyLight).toBeDefined();
    expect(kinds(paint({ backgroundColor: onlyLight }), 'light', false)).toEqual([]);
    expect(kinds(paint({ backgroundColor: onlyLight }), 'dark', false)).toEqual([
      'literal',
    ]);
  });

  test('a shadow must be a lift of the theme, or a token', () => {
    const lift = liftOf('light', 'lift2');
    expect(kinds(paint({ boxShadow: lift }), 'light', true)).toEqual([]);
    const foreign = [{ offsetX: 0, offsetY: 4, blurRadius: 8, color: '#FF00FF80' }];
    expect(kinds(paint({ boxShadow: foreign }), 'light', true)).toEqual(['literal']);
  });
});

describe('transparency (FR-072, FR-073, SC-008)', () => {
  const paper = `${Palettes.light.surface}EB`;

  test('a translucent background is a finding only when the surfaces must be opaque', () => {
    expect(kinds(paint({ backgroundColor: paper }), 'light', true)).toEqual([
      'translucent',
    ]);
    expect(kinds(paint({ backgroundColor: paper }), 'light', false)).toEqual([]);
  });

  test('the dark tints are translucent: a finding until they are laid over the paper', () => {
    expect(
      kinds(paint({ backgroundColor: Palettes.dark.accentTint }), 'dark', true),
    ).toEqual(['translucent']);
  });

  test('every documented exception is exactly its token and nothing near it', () => {
    for (const exception of TRANSLUCENT) {
      const value = Palettes['dark-contrast'][exception.token];
      const side = exception.lineOnly ?? 40;
      expect(
        kinds(
          paint({ backgroundColor: value, height: side, width: 200 }),
          'dark-contrast',
          true,
        ),
      ).toEqual([]);
      expect(
        kinds(
          paint({ backgroundColor: `${value.slice(0, 7)}7F` }),
          'dark-contrast',
          true,
        ),
      ).toEqual(['translucent']);
    }
  });

  test('a rule is a line, not a surface: a thick box in the hairline colour is a finding', () => {
    const { hairline } = Palettes.light;
    expect(kinds(paint({ backgroundColor: hairline, height: 1 }), 'light', true)).toEqual(
      [],
    );
    expect(
      kinds(paint({ backgroundColor: hairline, height: 48 }), 'light', true),
    ).toEqual(['translucent']);
  });

  test('a blur view and a glass effect are findings only when the surfaces must be opaque', () => {
    const blur = view({ intensity: 60, tint: 'light' }, 'ExpoBlurView');
    const glass = view({ glassEffectStyle: 'regular' });
    expect(kinds(blur, 'light', true)).toEqual(['blur']);
    expect(kinds(glass, 'light', true)).toEqual(['glass']);
    expect(kinds(blur, 'light', false)).toEqual([]);
    expect(kinds(glass, 'light', false)).toEqual([]);
  });
});

describe('the tab pill, which is translucent until the traveller asks otherwise', () => {
  const glass = jest.requireMock('expo-glass-effect') as {
    isLiquidGlassAvailable: jest.Mock;
    isGlassEffectAPIAvailable: jest.Mock;
  };

  beforeEach(() => {
    installThemeAwareKit();
    jest.replaceProperty(Platform, 'OS', 'ios');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    glass.isLiquidGlassAvailable.mockReturnValue(false);
    glass.isGlassEffectAPIAvailable.mockReturnValue(false);
  });

  test('iOS before 26: a blur, found by the audit', async () => {
    await renderIn(<TabBar {...tabBarProps()} />, { theme: 'light' });
    const found = auditNow({ theme: 'light', opaque: true }).map(
      (finding) => finding.kind,
    );
    expect(found).toContain('blur');
    expect(screen.getByTestId('tab-surface-blur')).toBeTruthy();
  });

  test('iOS 26: a glass effect, found by the audit', async () => {
    glass.isLiquidGlassAvailable.mockReturnValue(true);
    glass.isGlassEffectAPIAvailable.mockReturnValue(true);
    await renderIn(<TabBar {...tabBarProps()} />, { theme: 'dark' });
    const found = auditNow({ theme: 'dark', opaque: true }).map(
      (finding) => finding.kind,
    );
    expect(found).toContain('glass');
  });

  test.each([
    ['reduced transparency', { theme: 'light', reduceTransparency: true }],
    ['increased contrast', { theme: 'light-contrast' }],
  ] as const)('%s: solid, and the audit finds nothing', async (_label, setup) => {
    glass.isLiquidGlassAvailable.mockReturnValue(true);
    glass.isGlassEffectAPIAvailable.mockReturnValue(true);
    await renderIn(<TabBar {...tabBarProps()} />, setup);
    expect(auditNow({ theme: setup.theme, opaque: true })).toEqual([]);
    expect(screen.getByTestId('tab-surface-solid')).toBeTruthy();
  });
});
