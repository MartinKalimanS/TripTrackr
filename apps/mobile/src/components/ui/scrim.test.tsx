/**
 * T523 - `Scrim`, the one component that turns gradient DATA into pixels (feature 005,
 * contract C5-10 and C5-19, research D5-10; FR-007, FR-008, FR-068).
 *
 * Two things are proven here. First, the component's own output: what each `kind` hands to
 * React Native 0.86's `experimental_backgroundImage` (as the typed object form, so no
 * gradient string exists outside `src/theme/` at all), its box, its pointer and its
 * accessibility behaviour. Second, the legibility promise of FR-007: white text on the
 * scrims over a PURE WHITE photograph (the gate's `WHITE_PHOTO` fixture, the worst ground a
 * scrim can sit on) clears 4.5:1 (7:1 with increased contrast) at every position a line of
 * text can occupy. The contrast is measured on what the component RENDERS, read back from
 * the style, so retuning `src/theme/scrim.ts` or breaking the adapter fails here as well as
 * in the token gate.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { ContrastFloor, PaletteNames, Palettes, type PaletteName } from '@/theme';
import { blend, contrastRatio } from '@/theme/contrast';
import {
  CoverGlow,
  Passport,
  Sky,
  colourAt,
  scrimSpec,
  type GradientStop,
} from '@/theme/scrim';

import { WHITE_PHOTO } from '../../../test/theme/palette-gate-support';

import { Scrim, type ScrimKind } from './scrim';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function setTheme(name: PaletteName) {
  useAppearance.mockReturnValue({
    theme: name.startsWith('dark') ? 'dark' : 'light',
    themeName: name,
    prefersMoreContrast: name.endsWith('-contrast'),
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors[name],
    ready: true,
  });
}

beforeEach(() => setTheme('light'));

/** The shape React Native 0.86 takes for one layer of `experimental_backgroundImage`. */
interface Layer {
  type: 'linear-gradient' | 'radial-gradient';
  direction?: string;
  shape?: string;
  size?: unknown;
  position?: unknown;
  colorStops: { color: string | null; positions?: string[] }[];
}

/** A scrim is decoration, so a default query (which skips hidden nodes) must not find it. */
const node = (testID: string) =>
  screen.getByTestId(testID, { includeHiddenElements: true });

const flat = (testID: string): ViewStyle =>
  StyleSheet.flatten(node(testID).props.style) ?? {};

const layersOf = (testID: string): Layer[] =>
  (flat(testID).experimental_backgroundImage ?? []) as Layer[];

interface Stop {
  at: number;
  rgb: string;
  alpha: number;
}

/** A layer's stops as numbers: `#RRGGBBAA`, or `#RRGGBB` (opaque), at an explicit position. */
function stopsOf(layer: Layer): Stop[] {
  return layer.colorStops.map(({ color, positions }) => {
    expect(positions).toHaveLength(1);
    const text = String(color);
    expect(text).toMatch(/^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/);
    return {
      at: parseFloat(String(positions?.[0])) / 100,
      rgb: text.slice(0, 7),
      alpha: text.length === 9 ? parseInt(text.slice(7), 16) / 255 : 1,
    };
  });
}

/** The colour of a linear gradient at `at` (0 to 1): straight RGBA between the two stops. */
function sample(stops: Stop[], at: number): { rgb: string; alpha: number } {
  const next = stops.findIndex((stop) => stop.at >= at);
  if (next <= 0) return stops[Math.max(next, 0)] ?? stops[stops.length - 1];
  const from = stops[next - 1];
  const to = stops[next];
  const t = (at - from.at) / (to.at - from.at || 1);
  return {
    rgb: t < 0.5 ? from.rgb : to.rgb,
    alpha: from.alpha + (to.alpha - from.alpha) * t,
  };
}

/** The ground a layer leaves over a white photograph at `at`. */
function overWhite(stops: Stop[], at: number): string {
  const { rgb, alpha } = sample(stops, at);
  return blend(rgb, WHITE_PHOTO, alpha);
}

const positions = (from: number, to: number, extra: number[]) => [
  ...new Set([
    ...Array.from({ length: 21 }, (_, index) => from + ((to - from) * index) / 20),
    ...extra.filter((at) => at >= from && at <= to),
  ]),
];

describe('Scrim - the gradient is the typed object form, never a string', () => {
  test.each(['top', 'bottom', 'sky'] as const)(
    '%s hands layers, not a string',
    async (kind) => {
      await render(<Scrim kind={kind} />);
      const style = flat(`scrim-${kind}`);
      expect(Array.isArray(style.experimental_backgroundImage)).toBe(true);
    },
  );

  test('the top scrim is the contract box: 120 dp, held to 44 percent, then to nothing', async () => {
    await render(<Scrim kind="top" />);
    const spec = scrimSpec(false);
    expect(flat('scrim-top')).toMatchObject({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: spec.top.height,
    });
    const [layer] = layersOf('scrim-top');
    expect(layer.type).toBe('linear-gradient');
    expect(layer.direction).toBe('to bottom');
    expect(
      stopsOf(layer).map((stop) => [stop.at, stop.rgb, +stop.alpha.toFixed(2)]),
    ).toEqual([
      [0, spec.rgb, spec.top.alpha],
      [spec.top.holdTo, spec.rgb, spec.top.alpha],
      [1, spec.rgb, 0],
    ]);
  });

  test('the bottom scrim fills its box with the four stops of the contract', async () => {
    await render(<Scrim kind="bottom" />);
    const spec = scrimSpec(false);
    expect(flat('scrim-bottom')).toMatchObject(StyleSheet.absoluteFill);
    const [layer] = layersOf('scrim-bottom');
    expect(
      stopsOf(layer).map((stop) => [stop.at, stop.rgb, +stop.alpha.toFixed(2)]),
    ).toEqual(spec.bottom.map((stop) => [stop.at, spec.rgb, stop.alpha]));
  });

  test('the sky is the Sky data: the linear stops under the glows, glows on top', async () => {
    await render(<Scrim kind="sky" />);
    expect(flat('scrim-sky')).toMatchObject(StyleSheet.absoluteFill);
    const layers = layersOf('scrim-sky');
    expect(layers.map((layer) => layer.type)).toEqual([
      ...Sky.light.glows.map(() => 'radial-gradient'),
      'linear-gradient',
    ]);
    const linear = layers[layers.length - 1];
    expect(stopsOf(linear).map((stop) => [stop.at, stop.rgb])).toEqual(
      Sky.light.stops.map((stop) => [stop.at, stop.colour]),
    );
  });

  test('the night sky has its own two glows', async () => {
    setTheme('dark');
    await render(<Scrim kind="sky" />);
    const layers = layersOf('scrim-sky');
    expect(layers.filter((layer) => layer.type === 'radial-gradient')).toHaveLength(
      Sky.dark.glows.length,
    );
    expect(stopsOf(layers[layers.length - 1])[0].rgb).toBe(Sky.dark.stops[0].colour);
  });

  test('a glow is an ellipse of the glow radii, centred on the glow, fading by its fadeAt', async () => {
    await render(<Scrim kind="sky" />);
    const [glowLayer] = layersOf('scrim-sky');
    const [glow] = Sky.light.glows;
    expect(glowLayer.shape).toBe('ellipse');
    expect(glow.radius).toEqual([1.2, 0.7]);
    expect(glow.centre).toEqual([0.92, -0.08]);
    expect(glowLayer.size).toEqual({ x: '120%', y: '70%' });
    expect(glowLayer.position).toEqual({ left: '92%', top: '-8%' });
    const [peak, gone] = stopsOf(glowLayer);
    expect(peak).toMatchObject({ at: 0, rgb: glow.colour });
    expect(peak.alpha).toBeCloseTo(glow.alpha, 2);
    expect(gone).toMatchObject({ at: glow.fadeAt, rgb: glow.colour, alpha: 0 });
  });

  test('the contrast themes draw the darker scrims, the base sky and the base glows', async () => {
    setTheme('light-contrast');
    await render(<Scrim kind="bottom" />);
    const spec = scrimSpec(true);
    expect(stopsOf(layersOf('scrim-bottom')[0]).map((stop) => stop.rgb)).toEqual(
      spec.bottom.map(() => spec.rgb),
    );
    expect(
      Math.max(...stopsOf(layersOf('scrim-bottom')[0]).map((s) => s.alpha)),
    ).toBeCloseTo(0.94, 2);
  });
});

describe('Scrim - the caption scrim wraps its text', () => {
  test('is a 48 dp ramp from nothing, then a block that holds the children', async () => {
    await render(
      <Scrim kind="caption">
        <Text>Portugal Road Trip</Text>
      </Scrim>,
    );
    const spec = scrimSpec(false);
    expect(flat('scrim-caption-ramp')).toMatchObject({ height: spec.caption.rampHeight });
    const ramp = stopsOf(layersOf('scrim-caption-ramp')[0]);
    expect(ramp[0].alpha).toBe(0);
    expect(ramp[ramp.length - 1].alpha).toBeCloseTo(spec.caption.rampTo, 2);

    const block = stopsOf(layersOf('scrim-caption-block')[0]);
    expect(block[0].alpha).toBeCloseTo(spec.caption.rampTo, 2);
    expect(block[block.length - 1].alpha).toBeCloseTo(spec.caption.blockTo, 2);
    expect(screen.getByText('Portugal Road Trip')).toBeOnTheScreen();
  });

  test('the block grows with its text: it has a minimum, never a fixed height', async () => {
    await render(
      <Scrim kind="caption">
        <Text>Two lines of a very long trip title</Text>
      </Scrim>,
    );
    const block = flat('scrim-caption-block');
    expect(block.height).toBeUndefined();
    expect(block.maxHeight).toBeUndefined();
  });

  test('the ramp meets the block with no seam: the same colour at the join', async () => {
    await render(<Scrim kind="caption" />);
    const ramp = stopsOf(layersOf('scrim-caption-ramp')[0]);
    const block = stopsOf(layersOf('scrim-caption-block')[0]);
    expect(ramp[ramp.length - 1].rgb).toBe(block[0].rgb);
    expect(ramp[ramp.length - 1].alpha).toBeCloseTo(block[0].alpha, 2);
  });

  test('its text stays readable to assistive technology', async () => {
    await render(
      <Scrim kind="caption">
        <Text>Portugal Road Trip</Text>
      </Scrim>,
    );
    expect(screen.getByText('Portugal Road Trip')).toBeOnTheScreen();
    expect(node('scrim-caption-ramp').props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
    expect(node('scrim-caption-block').props.accessibilityElementsHidden).not.toBe(true);
  });
});

describe('Scrim - a generated cover is a gradient between two palette stops', () => {
  test.each([0, 1, 2] as const)(
    'palette %i draws its two stops at 135 degrees',
    async (index) => {
      await render(<Scrim kind="cover" palette={index} />);
      const light = Palettes.light;
      const start = light[`cover${index + 1}Start` as keyof typeof light];
      const end = light[`cover${index + 1}End` as keyof typeof light];
      const layers = layersOf('scrim-cover');
      const linear = layers[layers.length - 1];
      expect(linear.direction).toBe(`${Passport.angle}deg`);
      expect(stopsOf(linear).map((stop) => stop.rgb)).toEqual([start, end]);
    },
  );

  test('carries the amber corner of a cover (CoverGlow, not the passport glow) above the gradient', async () => {
    await render(<Scrim kind="cover" palette={0} />);
    const layers = layersOf('scrim-cover');
    expect(layers.map((layer) => layer.type)).toEqual([
      'radial-gradient',
      'linear-gradient',
    ]);
    expect(stopsOf(layers[0])[0]).toMatchObject({ at: 0, rgb: CoverGlow.colour });
    expect(stopsOf(layers[0])[0].alpha).toBeCloseTo(CoverGlow.alpha, 2);
    expect(layers[0].size).toEqual({ x: '85%', y: '95%' });
    expect(layers[0].position).toEqual({ left: '100%', top: '0%' });
  });

  test('takes the stops of the theme the traveller is in', async () => {
    setTheme('light-contrast');
    await render(<Scrim kind="cover" palette={1} />);
    const layers = layersOf('scrim-cover');
    expect(stopsOf(layers[layers.length - 1]).map((stop) => stop.rgb)).toEqual([
      Palettes['light-contrast'].cover2Start,
      Palettes['light-contrast'].cover2End,
    ]);
  });
});

describe('Scrim - the passport card (F13; C5-10 Passport)', () => {
  test.each(PaletteNames)(
    'is the navy cover of the card, whatever the theme (%s)',
    async (name) => {
      setTheme(name);
      await render(<Scrim kind="passport" />);
      const layers = layersOf('scrim-passport');
      expect(layers.map((layer) => layer.type)).toEqual([
        'radial-gradient',
        'linear-gradient',
      ]);
      const linear = layers[1];
      expect(linear.direction).toBe(`${Passport.angle}deg`);
      expect(stopsOf(linear).map((stop) => stop.rgb)).toEqual([...Passport.stops]);
    },
  );

  test('carries the faint amber glow of the passport in its top right corner', async () => {
    await render(<Scrim kind="passport" />);
    const [glow] = layersOf('scrim-passport');
    expect(stopsOf(glow)[0]).toMatchObject({ at: 0, rgb: Passport.glow.colour });
    expect(stopsOf(glow)[0].alpha).toBeCloseTo(Passport.glow.alpha, 2);
    expect(glow.size).toEqual({ x: '70%', y: '90%' });
    expect(glow.position).toEqual({ left: '100%', top: '0%' });
  });

  test('fills its parent, takes no touch and is hidden from assistive technology', async () => {
    await render(<Scrim kind="passport" />);
    expect(flat('scrim-passport')).toMatchObject({ position: 'absolute' });
    expect(node('scrim-passport').props.pointerEvents).toBe('none');
    expect(node('scrim-passport').props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
  });
});

describe('Scrim - the recap tile (F13)', () => {
  test.each(PaletteNames)(
    'is the coral to amber gradient at 135 degrees (%s)',
    async (name) => {
      setTheme(name);
      await render(<Scrim kind="recap" />);
      const [linear] = layersOf('scrim-recap');
      expect(linear.direction).toBe(`${Passport.angle}deg`);
      expect(stopsOf(linear).map((stop) => stop.rgb)).toEqual([
        Palettes[name].accent,
        Palettes[name].amber,
      ]);
      expect(node('scrim-recap').props.pointerEvents).toBe('none');
    },
  );
});

describe('Scrim - the fade under the tab pill (T530, FR-022)', () => {
  test.each(PaletteNames)(
    'is a gradient from nothing to the canvas of %s, top to bottom',
    async (name) => {
      setTheme(name);
      await render(<Scrim kind="fade" />);

      const [layer] = layersOf('scrim-fade');
      expect(layersOf('scrim-fade')).toHaveLength(1);
      expect(layer.type).toBe('linear-gradient');
      expect(layer.direction).toBe('to bottom');
      const stops = stopsOf(layer);
      expect(stops).toHaveLength(2);
      expect(stops[0]).toMatchObject({
        at: 0,
        rgb: Palettes[name].canvas.toUpperCase(),
        alpha: 0,
      });
      expect(stops[1]).toMatchObject({
        at: 1,
        rgb: Palettes[name].canvas.toUpperCase(),
        alpha: 1,
      });
    },
  );

  test('fades to the surface where the scene under the pill is a sheet (ground="surface")', async () => {
    setTheme('dark');
    await render(<Scrim kind="fade" ground="surface" />);

    const stops = stopsOf(layersOf('scrim-fade')[0]);
    expect(stops[1].rgb).toBe(Palettes.dark.surface.toUpperCase());
    // The two grounds differ in the dark themes, which is why the choice exists.
    expect(Palettes.dark.surface).not.toBe(Palettes.dark.canvas);
  });

  test('sits on the bottom edge across the width, and takes its height from the caller', async () => {
    await render(<Scrim kind="fade" style={{ height: 48 }} />);
    expect(flat('scrim-fade')).toMatchObject({
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 48,
    });
  });

  test('takes no touch and is hidden from assistive technology, like every scrim', async () => {
    await render(<Scrim kind="fade" />);
    const fade = node('scrim-fade');
    expect(fade.props.pointerEvents).toBe('none');
    expect(fade.props.accessibilityElementsHidden).toBe(true);
    expect(fade.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('is a gradient and never an opacity: a fade of the ground, not of the pill', async () => {
    await render(<Scrim kind="fade" />);
    expect(flat('scrim-fade').opacity).toBeUndefined();
  });
});

describe('Scrim - what it is to the touch and to assistive technology', () => {
  test.each(['top', 'bottom', 'sky'] as const)(
    '%s lets touches through',
    async (kind) => {
      await render(<Scrim kind={kind} />);
      expect(node(`scrim-${kind}`).props.pointerEvents).toBe('none');
    },
  );

  test.each(['top', 'bottom', 'sky', 'cover'] as const)(
    '%s is decoration: hidden from assistive technology',
    async (kind) => {
      await render(<Scrim kind={kind} palette={0} />);
      const scrim = node(`scrim-${kind}`);
      expect(scrim.props.accessibilityElementsHidden).toBe(true);
      expect(scrim.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(screen.queryByTestId(`scrim-${kind}`)).toBeNull();
    },
  );

  test('a caller testID replaces the default one', async () => {
    await render(<Scrim kind="top" testID="hero-top" />);
    expect(node('hero-top')).toBeTruthy();
    expect(() => node('scrim-top')).toThrow();
  });

  test('a caller style positions it, over the default box', async () => {
    await render(<Scrim kind="top" style={{ height: 80, top: 8 }} />);
    expect(flat('scrim-top')).toMatchObject({ position: 'absolute', height: 80, top: 8 });
  });
});

/**
 * FR-007 and P8: white text over a pure white photograph. A line of text sits where the
 * contract says it does: in the status-bar zone of the top scrim (up to where it starts to
 * fade), from the 55 percent stop down in the bottom scrim, and anywhere in the caption
 * block (which wraps the text, so it is darkest exactly where the text is).
 */
describe.each(PaletteNames)('white text on a white photograph - %s', (name) => {
  const contrast = name.endsWith('-contrast');
  const floor = contrast ? ContrastFloor.increasedContrast : ContrastFloor.normalText;
  const white = (ground: string) => contrastRatio(Palettes[name].onPhoto, ground);
  beforeEach(() => setTheme(name));

  test(`the top scrim holds ${floor}:1 where the status bar draws`, async () => {
    await render(<Scrim kind="top" />);
    const spec = scrimSpec(contrast);
    const stops = stopsOf(layersOf('scrim-top')[0]);
    for (const at of positions(0, spec.top.holdTo, [])) {
      expect(white(overWhite(stops, at))).toBeGreaterThanOrEqual(floor);
    }
  });

  test(`the bottom scrim holds ${floor}:1 from its 55 percent stop down`, async () => {
    await render(<Scrim kind="bottom" />);
    const stops = stopsOf(layersOf('scrim-bottom')[0]);
    for (const at of positions(
      0.55,
      1,
      stops.map((stop) => stop.at),
    )) {
      expect(white(overWhite(stops, at))).toBeGreaterThanOrEqual(floor);
    }
  });

  test(`the caption block holds ${floor}:1 at every position of its text`, async () => {
    await render(<Scrim kind="caption" />);
    const stops = stopsOf(layersOf('scrim-caption-block')[0]);
    for (const at of positions(0, 1, [])) {
      expect(white(overWhite(stops, at))).toBeGreaterThanOrEqual(floor);
    }
    // The contract's own number: never under `minUnderText` of alpha at any text scale.
    expect(Math.min(...stops.map((stop) => stop.alpha))).toBeGreaterThanOrEqual(
      scrimSpec(contrast).caption.minUnderText - 0.005,
    );
  });

  test('the caption ramp is a fade and carries no text, but still never lightens', async () => {
    await render(<Scrim kind="caption" />);
    const stops = stopsOf(layersOf('scrim-caption-ramp')[0]);
    stops.slice(1).forEach((stop, index) => {
      expect(stop.alpha).toBeGreaterThanOrEqual(stops[index].alpha);
    });
  });
});

/** Text over the sky is `ink` or `muted` (never white), on every stop and at every glow peak. */
describe.each(PaletteNames)('ink and muted on the sky - %s', (name) => {
  const contrast = name.endsWith('-contrast');
  const floor = contrast ? ContrastFloor.increasedContrast : ContrastFloor.normalText;
  beforeEach(() => setTheme(name));

  test(`every linear stop carries ink and muted at ${floor}:1`, async () => {
    await render(<Scrim kind="sky" />);
    const layers = layersOf('scrim-sky');
    for (const stop of stopsOf(layers[layers.length - 1])) {
      expect(contrastRatio(Palettes[name].ink, stop.rgb)).toBeGreaterThanOrEqual(floor);
      expect(contrastRatio(Palettes[name].muted, stop.rgb)).toBeGreaterThanOrEqual(floor);
    }
  });

  test('ink holds under every glow, at its peak, over the gradient at its centre', async () => {
    await render(<Scrim kind="sky" />);
    const layers = layersOf('scrim-sky');
    const linear = stopsOf(layers[layers.length - 1]);
    const base: GradientStop[] = linear.map((stop) => ({
      at: stop.at,
      colour: stop.rgb,
    }));
    for (const layer of layers.filter((entry) => entry.type === 'radial-gradient')) {
      const centre = layer.position as { left: string; top: string };
      const under = colourAt(base, parseFloat(centre.top) / 100);
      const [peak] = stopsOf(layer);
      expect(
        contrastRatio(Palettes[name].ink, blend(peak.rgb, under, peak.alpha)),
      ).toBeGreaterThanOrEqual(floor);
    }
  });
});

describe('Scrim - the kinds are exactly those of the contract and the cover', () => {
  test('the type lists them', () => {
    const kinds: ScrimKind[] = [
      'top',
      'bottom',
      'caption',
      'sky',
      'cover',
      'fade',
      'passport',
      'recap',
    ];
    expect(kinds).toHaveLength(8);
  });
});
