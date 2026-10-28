/**
 * The accessibility tree of what a test rendered, in reading order (feature 005, T560; FR-075,
 * FR-076, SC-015; not a test file). A screen reader walks the elements a screen exposes top to
 * bottom; this lists them the same way from `screen.toJSON()`, so a suite can pin the ORDER a
 * traveller hears, the name, role and state of each stop, and that decoration is not one.
 *
 * What it models (the platforms' shared rules, not either one's quirks):
 *
 * - A subtree is skipped when its root says `accessibilityElementsHidden`, `aria-hidden`,
 *   `importantForAccessibility="no-hide-descendants"`, or is `display: none`.
 * - An ELEMENT is a `Text` (accessible unless `accessible={false}`), a `TextInput`, a switch,
 *   an image that has a label, and any node with `accessible`. An element is one stop: what
 *   is inside it is its name, not further stops (an accessible `Pressable` groups its texts).
 * - The NAME is `accessibilityLabel` (or `aria-label`), else the visible text inside it,
 *   joined by single spaces. An unnamed element has the name `''`: that is the finding.
 * - A node with `importantForAccessibility="no"` is not an element but its children can be.
 *
 * It reads the host tree, so it sees only what a screen reader would be offered once the
 * component has rendered; whether a platform's reader says it the same way is a DEVICE check.
 */
import { screen } from '@testing-library/react-native';

import type { HostNode } from './host-nodes';

type Root = HostNode | HostNode[] | null;

/** One stop of the reading order. */
export interface AccessibleNode {
  /**
   * The spoken name: the label, else the text inside, with every run of white space (a
   * no-break space in a price, a newline) as one space; `''` when the element has neither.
   */
  name: string;
  /** The `testID`, when it has one. */
  id?: string;
  /** The host component: `Text`, `TextInput`, `View`... */
  kind: string;
  role?: string;
  /** The keys of `accessibilityState` (and `aria-*`) that are on, e.g. `selected`, `disabled`. */
  state: string[];
  hint?: string;
  /** The spoken value after the name (`accessibilityValue.text`): "Half", "50%". */
  value?: string;
  /** The custom actions a reader offers on it (the label, else the name): "Next trip"... */
  actions: string[];
}

const STATE_KEYS = ['busy', 'checked', 'disabled', 'expanded', 'selected'] as const;

const flatStyle = (style: unknown): Record<string, unknown> => {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  return style !== null && typeof style === 'object'
    ? (style as Record<string, unknown>)
    : {};
};

/** Whether a node (and so everything in it) is hidden from assistive technology. */
export function hidesDescendants(node: HostNode): boolean {
  const props = node.props;
  return (
    props.accessibilityElementsHidden === true ||
    props['aria-hidden'] === true ||
    props.importantForAccessibility === 'no-hide-descendants' ||
    flatStyle(props.style).display === 'none'
  );
}

/** Whether a node is a stop of its own, whatever it holds. */
function isElement(node: HostNode): boolean {
  const { props, type } = node;
  if (props.importantForAccessibility === 'no') return false;
  if (props.accessible === true) return true;
  if (props.accessible === false) return false;
  if (type === 'Text' || type === 'TextInput' || type === 'RCTSwitch') return true;
  return type === 'Image' && labelOf(node) !== undefined;
}

function labelOf(node: HostNode): string | undefined {
  const label = node.props.accessibilityLabel ?? node.props['aria-label'];
  return typeof label === 'string' && label.trim() !== '' ? label : undefined;
}

/**
 * The text a node holds that a reader would speak, not what is hidden: the pieces of one `Text`
 * run together ("Hello, " and "Ana"); the texts of a group are said one after the other.
 */
function spokenText(node: HostNode | string): string {
  if (typeof node === 'string') return node;
  if (hidesDescendants(node)) return '';
  const own =
    node.type === 'TextInput' ? [node.props.value ?? node.props.placeholder] : [];
  const parts = [
    ...own.filter((part): part is string => typeof part === 'string'),
    ...(node.children ?? []).map(spokenText),
  ];
  return node.type === 'Text' ? parts.join('') : parts.join(' ');
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

function actionsOf(node: HostNode): string[] {
  const list = node.props.accessibilityActions;
  if (!Array.isArray(list)) return [];
  return list.map(
    (action: { name: string; label?: string }) => action.label ?? action.name,
  );
}

function stateOf(node: HostNode): string[] {
  const props = node.props;
  const base = (props.accessibilityState ?? {}) as Record<string, unknown>;
  return STATE_KEYS.filter((key) => {
    const aria = props[`aria-${key}`];
    return (aria ?? base[key]) === true;
  });
}

function describe(node: HostNode): AccessibleNode {
  const props = node.props;
  const role = props.accessibilityRole ?? props.role;
  const entry: AccessibleNode = {
    name: squash(labelOf(node) ?? spokenText(node)),
    kind: node.type,
    state: stateOf(node),
    actions: actionsOf(node),
  };
  if (typeof props.testID === 'string') entry.id = props.testID;
  if (typeof role === 'string') entry.role = role;
  if (typeof props.accessibilityHint === 'string') entry.hint = props.accessibilityHint;
  const value = props.accessibilityValue as { text?: unknown } | undefined;
  if (typeof value?.text === 'string') entry.value = value.text;
  return entry;
}

function walk(node: HostNode | string): AccessibleNode[] {
  if (typeof node === 'string' || hidesDescendants(node)) return [];
  if (isElement(node)) return [describe(node)];
  return (node.children ?? []).flatMap(walk);
}

/** The stops of the reading order of `root` (the whole screen by default), first to last. */
export function accessibleNodes(root: Root = screen.toJSON() as Root): AccessibleNode[] {
  if (root === null) return [];
  return Array.isArray(root) ? root.flatMap(walk) : walk(root);
}

/** The host node with this `testID`, for reading the order inside one part of a screen. */
export function hostById(id: string): HostNode {
  const find = (root: Root): HostNode | undefined => {
    if (root === null) return undefined;
    if (Array.isArray(root)) return root.map(find).find((hit) => hit !== undefined);
    if (root.props.testID === id) return root;
    return (root.children ?? [])
      .map((child) => (typeof child === 'string' ? undefined : find(child)))
      .find((hit) => hit !== undefined);
  };
  const hit = find(screen.toJSON() as Root);
  if (hit === undefined) throw new Error(`No node with testID "${id}" is rendered.`);
  return hit;
}

/** One line per stop: `name [role, state] #id`, for a failure message and for reading. */
export function describeNodes(nodes: readonly AccessibleNode[]): string {
  return nodes
    .map((node, index) => {
      const traits = [node.role, ...node.state].filter(Boolean).join(', ');
      const id = node.id === undefined ? '' : ` #${node.id}`;
      return `${index + 1}. ${node.name === '' ? '(unnamed)' : node.name}${
        traits === '' ? '' : ` [${traits}]`
      }${id}`;
    })
    .join('\n');
}

/** What one expectation of the order may be: an id or exact name, or a pattern on the name. */
export type OrderMatcher = string | RegExp;

const matches = (node: AccessibleNode, wanted: OrderMatcher) =>
  typeof wanted === 'string'
    ? node.id === wanted || node.name === wanted
    : wanted.test(node.name) || (node.id !== undefined && wanted.test(node.id));

/**
 * The first expectation the reading order does not meet, or `null`: each matcher must be found
 * AFTER the one before it (other stops may lie between), so a new element is additive and
 * moving a pre-existing one is not (FR-075).
 */
export function firstOutOfOrder(
  nodes: readonly AccessibleNode[],
  expected: readonly OrderMatcher[],
): { wanted: OrderMatcher; after: number } | null {
  let from = 0;
  for (const wanted of expected) {
    const at = nodes.findIndex((node, index) => index >= from && matches(node, wanted));
    if (at === -1) return { wanted, after: from };
    from = at + 1;
  }
  return null;
}

/** Asserts the order of `expected`; the failure lists the whole tree it was looked for in. */
export function expectReadingOrder(
  nodes: readonly AccessibleNode[],
  expected: readonly OrderMatcher[],
): void {
  const miss = firstOutOfOrder(nodes, expected);
  if (miss !== null) {
    throw new Error(
      `Reading order broken: ${String(miss.wanted)} is not found after stop ${miss.after}.\n` +
        describeNodes(nodes),
    );
  }
}

/**
 * The controls of the tree that have no name: a button, a link, a field or any element with a
 * role that a reader could not say (SC-015). A bare `Text` with nothing in it is not a control.
 */
export function unnamed(nodes: readonly AccessibleNode[]): AccessibleNode[] {
  return nodes.filter(
    (node) =>
      node.name === '' &&
      (node.kind === 'TextInput' || (node.role !== undefined && node.role !== 'text')),
  );
}

/** What a drawing leaves in the host tree: a vector element, an icon glyph, a scrim, a cover. */
const ART_ID =
  /^(svg-|phosphor-react-native-|scrim-(?!caption$|caption-block$)|stamp-art-|ghost-stamp|generated-cover|state-art|trip-cover-art)/;

const isArt = (node: HostNode) =>
  node.type.startsWith('RNSVG') || ART_ID.test(String(node.props.testID ?? ''));

/**
 * The drawings a reader is offered: art that is not under a hidden subtree and that is an
 * element itself, or inside a node that speaks for it (an element with its own name) only when
 * nothing hides it. A drawing inside an accessible group is covered by the group's name; one
 * with no such cover and no hiding flag is decoration left exposed (FR-076). Returns the
 * `testID` (or host type) of each, in tree order.
 */
export function exposedArt(root: Root = screen.toJSON() as Root): string[] {
  const walkArt = (node: HostNode | string, grouped: boolean): string[] => {
    if (typeof node === 'string' || hidesDescendants(node)) return [];
    const inside = grouped || isElement(node);
    const here = isArt(node) && !grouped ? [String(node.props.testID ?? node.type)] : [];
    return [...here, ...(node.children ?? []).flatMap((child) => walkArt(child, inside))];
  };
  if (root === null) return [];
  return (Array.isArray(root) ? root : [root]).flatMap((node) => walkArt(node, false));
}
