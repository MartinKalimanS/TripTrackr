/**
 * What is moving in a rendered tree (feature 005, T562; FR-073, SC-008; not a test file): a CSS
 * animation or a transition in a style (`animationName`, `transitionProperty`, ...) and a
 * Reanimated layout animation on a node (`entering`, `exiting`, `layout`). Pure over
 * `screen.toJSON()`; the reduced-motion suites expect it empty.
 */
import { StyleSheet } from 'react-native';

import type { HostNode } from './audit';

const MOTION_STYLE = /^(animation|transition)/;
const MOTION_PROPS = ['entering', 'exiting', 'layout'] as const;

type Tree = HostNode | HostNode[] | null;

function walk(tree: Tree, found: string[]): void {
  if (tree === null) return;
  if (Array.isArray(tree)) {
    for (const child of tree) walk(child, found);
    return;
  }
  const id = typeof tree.props.testID === 'string' ? `#${tree.props.testID}` : '';
  const style = (StyleSheet.flatten(tree.props.style as never) ?? {}) as Record<
    string,
    unknown
  >;
  for (const [key, value] of Object.entries(style)) {
    if (MOTION_STYLE.test(key) && value !== undefined)
      found.push(`${tree.type}${id}: ${key}`);
  }
  for (const key of MOTION_PROPS) {
    if (tree.props[key] !== undefined) found.push(`${tree.type}${id}: ${key}`);
  }
  for (const child of tree.children ?? []) {
    if (typeof child !== 'string') walk(child, found);
  }
}

/** The moving parts of `tree`, as `Type#id: what`. */
export function motionIn(tree: Tree): string[] {
  const found: string[] = [];
  walk(tree, found);
  return found;
}
