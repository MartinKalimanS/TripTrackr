/**
 * Reads of the host tree a test rendered, for what a query by role, label or id cannot
 * reach: a scroll view, a container that is deliberately not an accessibility element, or
 * the glyph a symbol was asked for. Pure over `screen.toJSON()`; not a test file.
 */
import { screen } from '@testing-library/react-native';

/** A host node as `toJSON` renders it. */
export interface HostNode {
  type: string;
  props: Record<string, unknown>;
  children: (HostNode | string)[] | null;
}

type Root = HostNode | HostNode[] | null;

/** Every host node on screen (or below `root`) that satisfies `test`, outermost first. */
export function hostsWhere(
  test: (node: HostNode) => boolean,
  root: Root = screen.toJSON() as Root,
): HostNode[] {
  if (root === null) return [];
  if (Array.isArray(root)) return root.flatMap((child) => hostsWhere(test, child));
  const below = (root.children ?? []).flatMap((child) =>
    typeof child === 'string' ? [] : hostsWhere(test, child),
  );
  return test(root) ? [root, ...below] : below;
}

/** Every scroll view: a list's own, and any sideways row (a chip group). */
export const scrollers = () => hostsWhere((node) => node.type === 'RCTScrollView');

/** The classes of a node, as a list. */
export const classesOf = (node: { props: { className?: unknown } }): string[] =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

/**
 * A pattern that matches `text` as a substring, literally. `toHaveTextContent('x')` wants
 * the WHOLE text; a regular expression is its substring form, and a figure or a date holds
 * characters (a dot, a plus) a pattern would read as syntax.
 */
export const containing = (text: string): RegExp =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
