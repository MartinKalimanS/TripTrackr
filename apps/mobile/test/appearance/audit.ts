/**
 * The appearance audit (feature 005, T562; FR-072, FR-073, FR-078, FR-079, SC-008; not a test
 * file): walks the host tree a test rendered and reports
 *
 * - `literal`: a colour in a style or a colour prop that is not a token of the theme being
 *   painted (a raw literal, or a token of ANOTHER theme: a screen left in the previous theme);
 * - `translucent`: a background whose opacity is between 0 and 1, or a fill drawn at an opacity
 *   between 0 and 1, on anything that is not a documented exception (`allow-list.ts`); only
 *   when `opaque` is set (the contrast themes, reduced transparency);
 * - `blur` and `glass`: a blur view or a glass effect; only when `opaque` is set.
 *
 * Pure over `screen.toJSON()`: the `host-nodes.ts` shape.
 */
import { StyleSheet } from 'react-native';

import { Lift, Palettes, type PaletteName } from '@/theme';

import { LITERAL, TRANSLUCENT } from './allow-list';
import { isToken, parseColour, sameColour, sameRgb, type Rgba } from './colours';

export interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

export type FindingKind = 'literal' | 'translucent' | 'blur' | 'glass';

export interface Finding {
  kind: FindingKind;
  /** The nearest ids above the node and its own: where it sits. */
  node: string;
  detail: string;
}

export interface AuditOptions {
  theme: PaletteName;
  /** Contrast themes and reduced transparency: nothing translucent, no blur, no glass. */
  opaque: boolean;
}

type Tree = HostNode | HostNode[] | null;

/** Style keys that hold a colour, and the colour props of the SVG and gradient nodes. */
const COLOUR_STYLE = /colou?r$/i;
const COLOUR_PROPS = [
  'color',
  'fill',
  'stroke',
  'stopColor',
  'tintColor',
  'placeholderTextColor',
  'selectionColor',
  'underlayColor',
  'thumbColor',
];
/** Values that are not a colour at all. */
const NOT_A_COLOUR = new Set(['none', 'currentcolor', 'inherit', 'transparent']);

const flat = (style: unknown): Record<string, unknown> =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

function idOf(node: HostNode): string {
  const id = node.props.testID;
  return typeof id === 'string' ? `${node.type}#${id}` : node.type;
}

function visit(
  tree: Tree,
  trail: string[],
  each: (node: HostNode, where: string) => void,
): void {
  if (tree === null) return;
  if (Array.isArray(tree)) {
    for (const child of tree) visit(child, trail, each);
    return;
  }
  const own = idOf(tree);
  each(tree, [...trail.slice(-2), own].join(' > '));
  const below = own.includes('#') ? [...trail, own] : trail;
  for (const child of tree.children ?? []) {
    if (typeof child !== 'string') visit(child, below, each);
  }
}

/** A documented literal exception (`allow-list.ts`) covers this colour on this node. */
function excepted(node: HostNode, theme: PaletteName, rgba: Rgba): boolean {
  return LITERAL.some(
    (exception) =>
      (exception.node === undefined || exception.node.test(idOf(node))) &&
      exception.colours(theme).some((text) => {
        const known = parseColour(text);
        return known !== null && sameRgb(known, rgba);
      }),
  );
}

const liftColours = (theme: PaletteName): Rgba[] =>
  [...Lift[theme].lift1, ...Lift[theme].lift2]
    .map((layer) => parseColour(String(layer.color)))
    .filter((rgba): rgba is Rgba => rgba !== null);

/** CSS names a prop could carry; the kit's own words (`default`, `accent`) are not colours. */
const NAMED_COLOURS = new Set([
  'white',
  'black',
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'pink',
  'brown',
  'gray',
  'grey',
  'silver',
  'gold',
  'navy',
  'teal',
  'aqua',
  'cyan',
  'magenta',
  'lime',
  'maroon',
  'olive',
]);

function colourFindings(
  node: HostNode,
  where: string,
  { theme }: AuditOptions,
): Finding[] {
  const found: Finding[] = [];
  const flag = (key: string, detail: string) =>
    found.push({ kind: 'literal', node: where, detail: `${key}: ${detail}` });
  const allowed = (rgba: Rgba) => isToken(theme, rgba) || excepted(node, theme, rgba);

  const style = flat(node.props.style);
  for (const [key, value] of Object.entries(style)) {
    if (!COLOUR_STYLE.test(key) || typeof value !== 'string') continue;
    if (NOT_A_COLOUR.has(value.trim().toLowerCase())) continue;
    const rgba = parseColour(value);
    if (rgba === null) flag(key, `${value} (not a colour notation of the token layer)`);
    else if (!allowed(rgba)) flag(key, value);
  }
  for (const key of COLOUR_PROPS) {
    const value = node.props[key];
    if (typeof value !== 'string' || NOT_A_COLOUR.has(value.trim().toLowerCase()))
      continue;
    const rgba = parseColour(value);
    if (rgba === null) {
      if (NAMED_COLOURS.has(value.trim().toLowerCase()))
        flag(key, `${value} (a CSS name)`);
    } else if (!allowed(rgba)) {
      flag(key, value);
    }
  }

  const shadows = style.boxShadow;
  if (Array.isArray(shadows)) {
    for (const layer of shadows as { color?: unknown }[]) {
      const rgba = typeof layer.color === 'string' ? parseColour(layer.color) : null;
      const lift = rgba !== null && liftColours(theme).some((l) => sameColour(l, rgba));
      if (rgba === null || !(lift || allowed(rgba))) {
        flag(
          'boxShadow',
          `${JSON.stringify(layer)} is neither a Lift nor a token colour`,
        );
      }
    }
  }
  return found;
}

function sideOf(style: Record<string, unknown>): number {
  const sizes = [style.width, style.height].filter(
    (size): size is number => typeof size === 'number',
  );
  return sizes.length === 0 ? Infinity : Math.min(...sizes);
}

/** True when `rgba` is the value of a token a translucent background may be (the allow-list). */
function allowedBackground(theme: PaletteName, rgba: Rgba, side: number): string | null {
  for (const exception of TRANSLUCENT) {
    const colour = parseColour(Palettes[theme][exception.token] as string);
    if (colour === null || !sameColour(colour, rgba)) continue;
    if (exception.lineOnly === undefined || side <= exception.lineOnly) {
      return exception.reason;
    }
  }
  return null;
}

function opacityFindings(node: HostNode, where: string, theme: PaletteName): Finding[] {
  const found: Finding[] = [];
  const style = flat(node.props.style);
  const background =
    typeof style.backgroundColor === 'string' ? style.backgroundColor : '';
  const rgba = background === '' ? null : parseColour(background);
  if (rgba !== null && rgba.a > 0 && rgba.a < 1) {
    if (allowedBackground(theme, rgba, sideOf(style)) === null) {
      found.push({
        kind: 'translucent',
        node: where,
        detail: `backgroundColor: ${background} (opacity ${rgba.a.toFixed(2)})`,
      });
    }
  }
  // A fill drawn at less than full opacity is as translucent as one written with an alpha.
  const { opacity } = style;
  if (rgba !== null && rgba.a > 0 && typeof opacity === 'number') {
    if (opacity > 0 && opacity < 1) {
      found.push({
        kind: 'translucent',
        node: where,
        detail: `opacity: ${opacity} over backgroundColor: ${background}`,
      });
    }
  }
  const { type, props } = node;
  if (
    /blur/i.test(type) ||
    (props.intensity !== undefined && props.tint !== undefined) ||
    props.blurRadius !== undefined
  ) {
    found.push({ kind: 'blur', node: where, detail: `${type} draws a blur` });
  }
  if (/glass/i.test(type) || props.glassEffectStyle !== undefined) {
    found.push({ kind: 'glass', node: where, detail: `${type} draws a glass effect` });
  }
  return found;
}

/** Every finding of `tree`, in document order. */
export function audit(tree: Tree, options: AuditOptions): Finding[] {
  const found: Finding[] = [];
  visit(tree, [], (node, where) => {
    found.push(...colourFindings(node, where, options));
    if (options.opaque) found.push(...opacityFindings(node, where, options.theme));
  });
  return found;
}

/** The findings as lines a failing assertion prints. */
export const describeFindings = (findings: readonly Finding[]): string[] =>
  findings.map((finding) => `${finding.kind}: ${finding.node}: ${finding.detail}`);
