/**
 * The source half of the state sweep (feature 005, T559; FR-064, FR-066, FR-080 as amended by
 * Q-11; not a test file): it reads a component's text and reports the controls a traveller
 * could press that do nothing, or that pretend to do something.
 *
 * Two findings, both named after what the owner asked the sweep to catch:
 *
 * - `no-handler`: a pressable (`Pressable`, `Tappable`, `Button`, `IconButton`, the floating
 *   buttons) with no `onPress`, `onLongPress` or `onPressIn`, that is not explicitly disabled,
 *   does not spread props it may carry them in, and is not the child of a `Link asChild` (the
 *   router hands that child its press). A control with no handler is a dead end in a state.
 * - `no-op-handler`: a pressable whose handler is a function that does nothing (`() => {}`,
 *   `() => undefined`, `noop`), unless the control is explicitly `disabled`. A pictured control
 *   without a capability (Tier 3) must be a coming-soon control: `ComingSoonButton`, or
 *   `useComingSoon` for a control that is not a round icon, whose handler shows the one toast.
 * - `coming-soon-not-routed`: a control that claims to be coming soon (the hint "Not available
 *   yet", `COMING_SOON_HINT`, or an id `coming-soon-<name>`) in a file that imports neither
 *   `ComingSoonButton` nor `useComingSoon`, so its press is not the one toast.
 *
 * `findControlProblems` is pure over a string, so the rules are pinned on small inputs in
 * `control-guards.test.ts` before they are run over the tree.
 */
import fs from 'node:fs';
import path from 'node:path';

import * as ts from 'typescript';

export type ControlProblemKind =
  'no-handler' | 'no-op-handler' | 'coming-soon-not-routed';

export interface ControlProblem {
  kind: ControlProblemKind;
  /** The JSX tag: `Button`, `Pressable`, ... */
  tag: string;
  /** One-based. */
  line: number;
}

/** The components whose job is to be pressed. */
export const CONTROL_TAGS: ReadonlySet<string> = new Set([
  'Pressable',
  'Tappable',
  'Button',
  'IconButton',
  'AreaFab',
  'PlanTripFab',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
]);

const HANDLER_PROPS: ReadonlySet<string> = new Set([
  'onPress',
  'onLongPress',
  'onPressIn',
]);
const COMING_SOON_HINT_TEXT = 'Not available yet';
const COMING_SOON_NAMES = ['ComingSoonButton', 'useComingSoon'];

type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

const isOpening = (node: ts.Node): node is Opening =>
  ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node);

const attributesOf = (element: Opening): readonly ts.JsxAttributeLike[] =>
  element.attributes.properties;

function attributeNamed(element: Opening, name: string): ts.JsxAttribute | undefined {
  return attributesOf(element).find(
    (attribute): attribute is ts.JsxAttribute =>
      ts.isJsxAttribute(attribute) && attribute.name.getText() === name,
  );
}

/** The expression inside `attr={...}`; a bare `attr` has none. */
function valueOf(attribute: ts.JsxAttribute): ts.Expression | null {
  const { initializer } = attribute;
  if (!initializer) return null;
  return ts.isJsxExpression(initializer) ? (initializer.expression ?? null) : initializer;
}

function isNothing(expression: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(expression)) return isNothing(expression.expression);
  return (
    expression.kind === ts.SyntaxKind.NullKeyword ||
    expression.kind === ts.SyntaxKind.UndefinedKeyword ||
    (ts.isIdentifier(expression) && expression.text === 'undefined') ||
    (ts.isVoidExpression(expression) && ts.isNumericLiteral(expression.expression))
  );
}

/** A function that does nothing: an empty block, or a body that is `undefined`/`null`/`void 0`. */
function isNoOpFunction(node: ts.Node): boolean {
  if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return false;
  const { body } = node;
  if (ts.isBlock(body)) return body.statements.length === 0;
  return isNothing(body);
}

/** Names a file declares as functions that do nothing (`const noop = () => {}`). */
function noOpNames(source: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>(['noop', 'NOOP']);
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isNoOpFunction(node.initializer)
    ) {
      names.add(node.name.text);
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.body &&
      node.body.statements.length === 0
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

function isNoOpHandler(expression: ts.Expression, noOps: ReadonlySet<string>): boolean {
  if (ts.isParenthesizedExpression(expression)) {
    return isNoOpHandler(expression.expression, noOps);
  }
  if (isNoOpFunction(expression)) return true;
  return ts.isIdentifier(expression) && noOps.has(expression.text);
}

/** `disabled`, `disabled={true}`, or any expression other than the literal `false`. */
function isExplicitlyDisabled(element: Opening): boolean {
  const attribute = attributeNamed(element, 'disabled');
  if (!attribute) return false;
  const value = valueOf(attribute);
  return value === null || value.kind !== ts.SyntaxKind.FalseKeyword;
}

function hasSpread(element: Opening): boolean {
  return attributesOf(element).some((attribute) => ts.isJsxSpreadAttribute(attribute));
}

/** The control is the direct child of `<Link asChild>` or `<Slot>`: the parent gives it `onPress`. */
function isGivenItsPress(element: Opening): boolean {
  const own = ts.isJsxOpeningElement(element) ? element.parent : element;
  const parent = own.parent;
  if (!ts.isJsxElement(parent)) return false;
  const tag = parent.openingElement.tagName.getText();
  return (
    tag === 'Slot' ||
    (tag === 'Link' && attributeNamed(parent.openingElement, 'asChild') !== undefined)
  );
}

function handlerOf(element: Opening): ts.JsxAttribute | undefined {
  return attributesOf(element).find(
    (attribute): attribute is ts.JsxAttribute =>
      ts.isJsxAttribute(attribute) && HANDLER_PROPS.has(attribute.name.getText()),
  );
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function claimsComingSoon(element: Opening): boolean {
  const hint = attributeNamed(element, 'accessibilityHint')?.getText() ?? '';
  const id = attributeNamed(element, 'testID')?.getText() ?? '';
  return (
    hint.includes(COMING_SOON_HINT_TEXT) ||
    hint.includes('COMING_SOON_HINT') ||
    id.includes('coming-soon-')
  );
}

function routesComingSoon(text: string): boolean {
  return COMING_SOON_NAMES.some((name) => text.includes(name));
}

/** Every control in `text` that has no handler, a do-nothing handler, or a coming-soon claim it does not keep. */
export function findControlProblems(
  text: string,
  fileName = 'sample.tsx',
): ControlProblem[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const noOps = noOpNames(source);
  const routed = routesComingSoon(text);
  const problems: ControlProblem[] = [];

  const visit = (node: ts.Node): void => {
    if (isOpening(node)) inspect(node);
    ts.forEachChild(node, visit);
  };

  const inspect = (element: Opening): void => {
    const tag = element.tagName.getText();
    const line = lineOf(source, element);
    if (
      claimsComingSoon(element) &&
      !routed &&
      !fileName.endsWith('coming-soon-button.tsx')
    ) {
      problems.push({ kind: 'coming-soon-not-routed', tag, line });
    }
    if (!CONTROL_TAGS.has(tag)) return;

    const handler = handlerOf(element);
    const value = handler ? valueOf(handler) : null;
    const disabled = isExplicitlyDisabled(element);
    const handled = value !== null && !isNothing(value);

    if (!handled && !disabled && !hasSpread(element) && !isGivenItsPress(element)) {
      problems.push({ kind: 'no-handler', tag, line });
    }
    if (handled && !disabled && isNoOpHandler(value, noOps)) {
      problems.push({ kind: 'no-op-handler', tag, line });
    }
  };

  visit(source);
  return problems;
}

/** The files the sweep reads: every screen and component, tests, stories and the dev gallery aside. */
export function sweptSourceFiles(appRoot: string): string[] {
  const out: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === '__tests__' ||
          entry.name === 'dev' ||
          entry.name === '(dev)'
        ) {
          continue;
        }
        walk(full);
      } else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(path.join(appRoot, 'src'));
  return out.sort();
}
