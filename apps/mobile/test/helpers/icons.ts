/**
 * Reads of the glyphs a test rendered (feature 005, T518; research D5-07).
 *
 * `Icon` draws a Phosphor icon, which under Jest is a `react-native-svg` host node tagged
 * `phosphor-react-native-<phosphor name>-<weight>` and carrying `width`, `height`, `color`
 * and, when mirrored, a `scaleX: -1` transform. A suite asks for a REGISTRY key
 * (`'chevron-left'`), never for a Phosphor name, so a swap of the glyph behind a key does
 * not touch a test, and this file is the only place that knows the mapping. Pure over
 * `screen.toJSON()`; not a test file.
 */
import { ICONS, ICON_KEYS, type IconKey } from '@/components/ui/icon-registry';

import { hostsWhere, type HostNode } from './host-nodes';

export type GlyphWeight = 'regular' | 'fill' | 'duotone';

/** What was drawn: the registry key, its weight, the size and tint it was given. */
export interface Glyph {
  name: IconKey;
  weight: GlyphWeight;
  size: number;
  color: string;
  mirrored: boolean;
}

/**
 * The Phosphor name of a key (`caret-left` for `chevron-left`). A Phosphor icon is a plain
 * function component that returns its base element with `name`, so calling it reads the
 * name without a render.
 */
function phosphorNameOf(key: IconKey): string {
  const element = (ICONS[key] as (props: object) => { props: { name: string } })({});
  return element.props.name;
}

const KEY_BY_PHOSPHOR_NAME = new Map<string, IconKey>(
  ICON_KEYS.map((key) => [phosphorNameOf(key), key]),
);

const GLYPH_ID = /^phosphor-react-native-(.+)-(regular|fill|duotone)$/;

/** The id the glyph of `key` carries under Jest. */
export const glyphId = (key: IconKey, weight: GlyphWeight = 'regular'): string =>
  `phosphor-react-native-${phosphorNameOf(key)}-${weight}`;

function glyphOf(node: HostNode): Glyph | null {
  const match = GLYPH_ID.exec(String(node.props.testID ?? ''));
  const name = match ? KEY_BY_PHOSPHOR_NAME.get(match[1]) : undefined;
  if (!match || !name) return null;
  const transform = node.props.transform as { scaleX?: number }[] | undefined;
  return {
    name,
    weight: match[2] as GlyphWeight,
    size: Number(node.props.width),
    color: String(node.props.color),
    mirrored: transform?.some((entry) => entry.scaleX === -1) ?? false,
  };
}

/** Every glyph on screen (or below `root`), in tree order. */
export function glyphsIn(root?: Parameters<typeof hostsWhere>[1]): Glyph[] {
  return hostsWhere((node) => glyphOf(node) !== null, root)
    .map(glyphOf)
    .filter((glyph): glyph is Glyph => glyph !== null);
}

/** The registry keys on screen, in tree order: `['chevron-left', 'check']`. */
export const glyphNamesIn = (root?: Parameters<typeof hostsWhere>[1]): IconKey[] =>
  glyphsIn(root).map((glyph) => glyph.name);

/** Any glyph, whichever it is: for a test that asks only "is there an icon here". */
export const anyGlyph = /^phosphor-react-native-/;
