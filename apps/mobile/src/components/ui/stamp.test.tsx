/**
 * T523 - `Stamp` and `GhostStamp`, the passport's art (feature 005; FR-059, FR-076; contract
 * C5-25; research D5-08).
 *
 * `react-native-svg` is replaced by a stand-in that keeps every prop an element is given, so
 * what is asserted is the DRAWING the component asks for: the six shapes in their inks, the
 * circular text on a `TextPath`, the embedded Bricolage face, the wear as an SVG `<Mask>` of
 * baked path data (never a filter: `feTurbulence` and its kin draw nothing in 15.15.4), the
 * perforated outer ring, the tilt and the blend. `stamp-render.test.tsx` renders the real
 * library once per shape, so the stand-in is not the only witness.
 *
 * A stamp is decoration (FR-076): hidden from assistive technology, never a touch target; the
 * PARENT carries the meaning ("Stamp: Portugal, 12 October 2026", from `stampLabel`).
 */
import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { StyleSheet, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { PaletteNames, Palettes, type PaletteName } from '@/theme';

import { GhostStamp, Stamp } from './stamp';
import { ARCS, octagonPoints } from './stamp-layout';
import {
  STAMP_INKS,
  STAMP_SHAPES,
  stampDateText,
  stampSpec,
  type StampInk,
  type StampShape,
  type StampSpec,
} from './stamp-spec';
import { wearPath } from './stamp-wear';

jest.mock('@/hooks/use-appearance');
jest.mock('react-native-svg', () => {
  const React = require('react') as typeof import('react');
  const { View, Text } = require('react-native') as typeof import('react-native');
  const standIn = (kind: string, Host: React.ElementType = View) => {
    const StandIn = ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(Host, { testID: `svg-${kind}`, ...props }, children);
    StandIn.displayName = kind;
    return StandIn;
  };
  const Svg = standIn('Svg');
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Defs: standIn('Defs'),
    G: standIn('G'),
    Mask: standIn('Mask'),
    Path: standIn('Path'),
    Circle: standIn('Circle'),
    Rect: standIn('Rect'),
    Line: standIn('Line'),
    Polygon: standIn('Polygon'),
    Ellipse: standIn('Ellipse'),
    Text: standIn('Text', Text),
    TextPath: standIn('TextPath', Text),
  };
});

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const Uniwind = jest.requireMock('uniwind') as {
  useCSSVariable: (name: string | string[]) => unknown;
};

const FAMILY = 'BricolageGrotesque_700Bold';

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

beforeEach(() => {
  setTheme('light');
  jest
    .spyOn(Uniwind, 'useCSSVariable')
    .mockImplementation((name) =>
      name === '--font-display-bold' ? `'${FAMILY}'` : undefined,
    );
});
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const all = (kind: string) => screen.getAllByTestId(`svg-${kind}`, hidden);
const some = (kind: string) => screen.queryAllByTestId(`svg-${kind}`, hidden);
const flat = (testID: string): ViewStyle =>
  StyleSheet.flatten(screen.getByTestId(testID, hidden).props.style) ?? {};

/** A stamp of `shape` (the hash picks the shape, so build the spec by hand). */
function specOf(shape: StampShape, overrides: Partial<StampSpec> = {}): StampSpec {
  return {
    ...stampSpec('PT', '2026-10-12', 'Lisboa'),
    shape,
    ink: 'coral',
    rotationDeg: 3,
    wear: 1,
    perforated: false,
    ...overrides,
  };
}

const textsOf = () => some('Text').map((node) => node.props);
const textOf = (children: unknown): string =>
  Array.isArray(children) ? children.join('') : String(children);

describe('Stamp - the six shapes', () => {
  test.each(STAMP_SHAPES)(
    '%s draws its own rings and writes its code, top and date',
    async (shape) => {
      const spec = specOf(shape);
      await render(<Stamp spec={spec} />);
      const written = some('Text').map((node) =>
        textOf(node.props.children?.props?.children ?? node.props.children),
      );
      expect(written).toEqual(
        expect.arrayContaining([spec.iso2, spec.top, stampDateText(spec.date)]),
      );
      const rings = {
        circle: () => all('Circle').length,
        rect: () => all('Rect').filter((node) => node.props.rx !== undefined).length,
        hex: () => all('Polygon').length,
        oct: () => all('Polygon').length,
        scallop: () => all('Circle').length,
        oval: () => all('Ellipse').length,
      }[shape]();
      expect(rings).toBe(shape === 'circle' ? 3 : 2);
    },
  );

  test('the octagon is the prototype octagon: two rings of eight corners', async () => {
    await render(<Stamp spec={specOf('oct')} />);
    expect(all('Polygon').map((node) => node.props.points)).toEqual([
      octagonPoints(58),
      octagonPoints(50),
    ]);
  });

  test('the circle writes its top and its date on two arcs, centred on the arc', async () => {
    const spec = specOf('circle');
    await render(<Stamp spec={spec} />);
    const paths = all('Path').filter(
      (node) => node.props.id?.endsWith('-top') || node.props.id?.endsWith('-bottom'),
    );
    expect(paths.map((node) => node.props.d)).toEqual([
      ARCS.circleTop.d,
      ARCS.circleBottom.d,
    ]);
    const runs = all('TextPath');
    expect(runs).toHaveLength(2);
    for (const [index, run] of runs.entries()) {
      expect(run.props.href).toBe(`#${paths[index].props.id}`);
      expect(run.props.startOffset).toBe('50%');
    }
    expect(runs.map((run) => textOf(run.props.children))).toEqual([
      spec.top,
      stampDateText(spec.date),
    ]);
    for (const text of some('Text').filter((node) => node.props.children?.props?.href)) {
      expect(text.props.textAnchor).toBe('middle');
    }
  });

  test('the scallop writes only its top on an arc, over a ring of dots', async () => {
    await render(<Stamp spec={specOf('scallop')} />);
    expect(all('TextPath')).toHaveLength(1);
    const [dots] = all('Circle');
    expect(dots.props.strokeDasharray).toBe('0.1 9.6');
    expect(dots.props.strokeLinecap).toBe('round');
  });

  test('the shapes that write on a line use no arc', async () => {
    for (const shape of ['rect', 'hex', 'oct', 'oval'] as const) {
      const view = await render(<Stamp spec={specOf(shape)} />);
      expect(some('TextPath')).toHaveLength(0);
      await view.unmount();
    }
  });
});

describe('Stamp - ink, perforation and the wear mask', () => {
  test.each(PaletteNames)(
    'every ink is its stamp token in %s, in strokes and in text',
    async (name) => {
      setTheme(name);
      const tokens = Palettes[name];
      const inks: Record<StampInk, string> = {
        coral: tokens.stampCoral,
        navy: tokens.stampNavy,
        teal: tokens.stampTeal,
        green: tokens.stampGreen,
      };
      for (const ink of STAMP_INKS) {
        const view = await render(<Stamp spec={specOf('circle', { ink })} />);
        for (const ring of all('Circle')) {
          expect(ring.props.stroke).toBe(inks[ink]);
          expect(ring.props.fill).toBe('none');
        }
        for (const text of textsOf()) expect(text.fill).toBe(inks[ink]);
        await view.unmount();
      }
    },
  );

  test('a perforated stamp has a dashed outer ring and nothing else dashed', async () => {
    await render(<Stamp spec={specOf('circle', { perforated: true })} />);
    const [outer, ...inner] = all('Circle');
    expect(outer.props.strokeDasharray).toBe('7 5');
    for (const ring of inner) expect(ring.props.strokeDasharray).toBeUndefined();
  });

  test('a stamp that is not perforated has a solid outer ring', async () => {
    await render(<Stamp spec={specOf('circle', { perforated: false })} />);
    expect(all('Circle')[0].props.strokeDasharray).toBeUndefined();
  });

  test('the outer ring is the heavy one and the inner rings the fine ones', async () => {
    await render(<Stamp spec={specOf('circle')} />);
    const widths = all('Circle').map((ring) => ring.props.strokeWidth);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBe(widths[2]);
  });

  test.each([0, 1, 2, 3] as const)(
    'wear %i is the baked texture, as the shape of a Mask',
    async (wear) => {
      await render(<Stamp spec={specOf('hex', { wear })} />);
      const [mask] = all('Mask');
      expect(mask.props).toMatchObject({
        x: 0,
        y: 0,
        width: 120,
        height: 120,
        maskUnits: 'userSpaceOnUse',
      });
      const texture = all('Path').find((node) => node.props.fillRule === 'evenodd');
      expect(texture?.props.d).toBe(wearPath(wear));
      expect(texture?.props.fill).toBe(Palettes.light.onPhoto);
    },
  );

  test('the whole drawing is masked by that very mask', async () => {
    await render(<Stamp spec={specOf('rect')} />);
    const [mask] = all('Mask');
    const masked = all('G').find((group) => group.props.mask);
    expect(masked?.props.mask).toBe(`url(#${mask.props.id})`);
    expect(mask.props.id).toMatch(/^[A-Za-z0-9-]+$/);
  });

  test('two stamps never share an id', async () => {
    await render(
      <>
        <Stamp spec={specOf('circle')} testID="a" />
        <Stamp spec={specOf('circle')} testID="b" />
      </>,
    );
    const ids = all('Mask').map((mask) => mask.props.id);
    expect(new Set(ids).size).toBe(2);
    const arcs = all('Path')
      .map((node) => node.props.id)
      .filter(Boolean);
    expect(new Set(arcs).size).toBe(arcs.length);
  });

  test('uses no filter at all: feTurbulence and its kin draw nothing in react-native-svg 15.15.4', () => {
    const code = (name: string) =>
      fs
        .readFileSync(path.join(__dirname, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    for (const name of ['stamp.tsx', 'stamp-layout.ts', 'stamp-wear.ts']) {
      expect(code(name)).not.toMatch(
        /[Ff]eTurbulence|[Ff]eDisplacementMap|[Ff]eMorphology|<Filter|\bfilter=|\bFilter\b/,
      );
    }
  });
});

describe('Stamp - the embedded display face', () => {
  test('every text is the Bricolage Bold of the stylesheet variable, not the platform face', async () => {
    await render(<Stamp spec={specOf('circle')} />);
    for (const text of textsOf()) {
      expect(text.fontFamily).toBe(FAMILY);
      expect(text.fontWeight).toBe('normal');
    }
    expect(textsOf().length).toBeGreaterThanOrEqual(3);
  });

  test('draws the same text without a face when the stylesheet declares none', async () => {
    jest.spyOn(Uniwind, 'useCSSVariable').mockReturnValue(undefined);
    await render(<Stamp spec={specOf('oval')} />);
    for (const text of textsOf()) expect(text.fontFamily).toBeUndefined();
  });

  test('fits a long city: its size or spacing gives way, the text is not cut', async () => {
    const spec = specOf('rect', { top: 'SANTIAGO DE COMP' });
    await render(<Stamp spec={spec} />);
    const top = textsOf().find((text) => textOf(text.children) === spec.top);
    expect(top).toBeDefined();
    expect(Number(top?.fontSize)).toBeLessThanOrEqual(10);
    expect(Number(top?.letterSpacing)).toBeLessThan(3);
  });
});

describe('Stamp - the box, the tilt and the blend', () => {
  test('is a square of the size asked, 124 by default', async () => {
    await render(<Stamp spec={specOf('circle')} />);
    expect(flat('stamp')).toMatchObject({ width: 124, height: 124 });
    expect(all('Svg')[0].props).toMatchObject({
      width: 124,
      height: 124,
      viewBox: '0 0 120 120',
    });
  });

  test('takes any size', async () => {
    await render(<Stamp spec={specOf('circle')} size={64} />);
    expect(flat('stamp')).toMatchObject({ width: 64, height: 64 });
  });

  test.each([-8, -1, 0, 5, 8])('is tilted by its own %i degrees', async (rotationDeg) => {
    await render(<Stamp spec={specOf('circle', { rotationDeg })} />);
    expect(flat('stamp').transform).toEqual([{ rotate: `${rotationDeg}deg` }]);
  });

  test('multiplies into the page in the light themes and lies normally in the dark ones', async () => {
    for (const [name, blend] of [
      ['light', 'multiply'],
      ['light-contrast', 'multiply'],
      ['dark', 'normal'],
      ['dark-contrast', 'normal'],
    ] as const) {
      setTheme(name);
      const view = await render(<Stamp spec={specOf('circle')} />);
      expect(flat('stamp').mixBlendMode).toBe(blend);
      await view.unmount();
    }
  });

  test('a caller testID replaces the default one', async () => {
    await render(<Stamp spec={specOf('circle')} testID="stamp-PT" />);
    expect(screen.getByTestId('stamp-PT', hidden)).toBeTruthy();
  });
});

describe('Stamp - decoration, with the meaning on the parent (FR-076)', () => {
  test('is hidden from assistive technology, with its text, and takes no touch', async () => {
    await render(<Stamp spec={specOf('circle')} />);
    const stamp = screen.getByTestId('stamp', hidden);
    expect(stamp.props.accessibilityElementsHidden).toBe(true);
    expect(stamp.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(stamp.props.pointerEvents).toBe('none');
    expect(stamp.props.accessible).toBe(false);
    expect(screen.queryByTestId('stamp')).toBeNull();
    expect(screen.queryByText('PT')).toBeNull();
  });
});

describe('GhostStamp - an unvisited slot', () => {
  test('is a dashed outline in the border colour, no text, no wear', async () => {
    await render(<GhostStamp />);
    const [outer, inner] = all('Circle');
    expect(outer.props).toMatchObject({
      r: 54,
      strokeWidth: 3,
      strokeDasharray: '7 6',
      strokeLinecap: 'round',
      stroke: Palettes.light.border,
      fill: 'none',
    });
    expect(inner.props).toMatchObject({
      r: 42,
      strokeWidth: 1.5,
      strokeDasharray: '3 5',
      stroke: Palettes.light.border,
    });
    expect(some('Text')).toHaveLength(0);
    expect(some('Mask')).toHaveLength(0);
  });

  test.each(PaletteNames)('is the border token of %s', async (name) => {
    setTheme(name);
    await render(<GhostStamp />);
    expect(all('Circle')[0].props.stroke).toBe(Palettes[name].border);
  });

  test('is 96 by default, takes any size and a tilt, and does not blend', async () => {
    await render(<GhostStamp size={72} rotationDeg={-4} testID="ghost" />);
    expect(flat('ghost')).toMatchObject({
      width: 72,
      height: 72,
      transform: [{ rotate: '-4deg' }],
    });
    expect(flat('ghost').mixBlendMode).toBeUndefined();
  });

  test('defaults to 96 and no tilt', async () => {
    await render(<GhostStamp />);
    expect(flat('ghost-stamp')).toMatchObject({ width: 96, height: 96 });
  });

  test('is hidden from assistive technology and takes no touch', async () => {
    await render(<GhostStamp />);
    const ghost = screen.getByTestId('ghost-stamp', hidden);
    expect(ghost.props.accessibilityElementsHidden).toBe(true);
    expect(ghost.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(ghost.props.pointerEvents).toBe('none');
    expect(screen.queryByTestId('ghost-stamp')).toBeNull();
  });
});
