/**
 * Helpers for the text-scale sweep (feature 005, T561; FR-074, SC-007; not a test file).
 *
 *   TEXT_SCALES                the four scales the sweep renders at: 1, 1.15, 1.5 and 2
 *   phoneAtFontScale(scale)    the 390 by 844 phone at that font scale, for what reads
 *                              `useWindowDimensions` (`useFontScale`); call `jest.restoreAllMocks()` after
 *   styleOf(node)              a host node's style, flattened
 *   fixedHeightTextContainers  every rendered node that pins a numeric `height` and holds text
 *
 * A suite whose component reads `useAppearance().fontScale` sets that on the mocked hook as
 * well (`appearance({ fontScale })`, `test/helpers/appearance.ts`): the two hooks read the
 * same system setting but are separate modules.
 */
import { screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import type { HostNode } from './host-nodes';

export const TEXT_SCALES = [1, 1.15, 1.5, 2] as const;

export type TextScale = (typeof TEXT_SCALES)[number];

/** True from the reflow threshold up (`components/ui/reflow.ts`): the layouts that stack. */
export const reflows = (scale: number): boolean => scale >= 1.15;

export function phoneAtFontScale(fontScale: number): void {
  jest
    .spyOn(Dimensions, 'get')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
}

export function styleOf(node: { props: { style?: unknown } }): Record<string, unknown> {
  return (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
}

export interface FixedHeight {
  type: string;
  testID: string | null;
  height: number;
}

type Root = HostNode | HostNode[] | null;

/** Text that grows with the system setting: a node that opts out (a flag, a cover letter) does not. */
function holdsScalingText(node: HostNode | string): boolean {
  if (typeof node === 'string') return node.trim().length > 0;
  if (node.props.allowFontScaling === false) return false;
  return (node.children ?? []).some(holdsScalingText);
}

function walk(node: HostNode | string, found: FixedHeight[], allow: RegExp[]): void {
  if (typeof node === 'string') return;
  const { height } = styleOf(node);
  const testID = typeof node.props.testID === 'string' ? node.props.testID : null;
  const allowed = testID !== null && allow.some((pattern) => pattern.test(testID));
  if (typeof height === 'number' && !allowed && holdsScalingText(node)) {
    found.push({ type: node.type, testID, height });
  }
  (node.children ?? []).forEach((child) => walk(child, found, allow));
}

/**
 * Every host node of the render (or below `root`) whose own style has a numeric `height` and
 * which holds text that scales at any depth: a container that cannot grow when the text does. A
 * fixed `height` on a node with no text in it (a thumbnail, a dot, a bar), or only text that
 * ignores the system size (`allowFontScaling={false}`: a flag, a cover letter), is not a clip
 * risk and is not listed; `allow` names the test ids of a drawing whose text is part of the
 * picture (a stamp, whose letters are painted by the SVG and do not scale). Style `height` only: a class such as `h-5` is the ratchet's to read
 * (`test/scale/fixed-heights.test.ts`), Jest renders no classes.
 */
export function fixedHeightTextContainers(
  root: Root = screen.toJSON() as Root,
  allow: RegExp[] = [],
): FixedHeight[] {
  const found: FixedHeight[] = [];
  if (root === null) return found;
  (Array.isArray(root) ? root : [root]).forEach((node) => walk(node, found, allow));
  return found;
}
