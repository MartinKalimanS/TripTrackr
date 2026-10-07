'use strict';

/**
 * Static extraction of testIDs and accessible names from the app's sources
 * (feature 004, T414; FR-037, SC-003).
 *
 * The single implementation behind `scripts/testid-baseline.mjs` (which writes
 * and checks the baseline from the command line) and `test/testid-*.test.ts`
 * (which fail the build when the tree loses one). It is CommonJS on purpose:
 * Jest's `jest-expo` transform only covers `.js`/`.ts` files, so a `.mjs` module
 * could not be imported by a test. `extract-ids.d.ts` types it for TypeScript.
 *
 * It parses with the TypeScript compiler API (already a dev dependency), so
 * comments, JSX text and nested template literals cannot fool it the way a
 * regular expression could.
 *
 * What it reads, from `src/**\/*.{ts,tsx}` minus tests and declaration files:
 *
 * - `testID="x"`, `testID={'x'}`, `testID={`x-${y}`}`, and the branches of a
 *   conditional or the operands of `??` / `||` inside the braces; object
 *   properties and shorthand properties likewise (`{ testID: 'x' }`);
 * - any name ending in `TestID` as a testID (`tabBarButtonTestID`);
 * - `accessibilityLabel` and `aria-label`, which share one list: a baseline label
 *   is satisfied by either spelling;
 * - ids built from a `testIDPrefix` (`<FormActions testIDPrefix="add-trip" />`):
 *   every prefix is crossed with every suffix a component builds from its own
 *   `testIDPrefix` prop (`${testIDPrefix}-cancel`, `${testIDPrefix}-save`).
 *
 * Every `${...}` of a template becomes `<param>` (`trip-card-<param>`), except
 * an identifier that is a string `const` in scope (`lexical-scope.js`), which is
 * substituted: `const base = `notice-${id}`` makes `${base}-open` read
 * `notice-<param>-open`.
 *
 * Names kept in a copy table are followed too: `COPY.retry` and `LABELS[kind]`
 * resolve through a module-level `const COPY = { retry: 'Try again' }` found in
 * any source file, matched by the object's name alone (`LABELS[kind]` stands for
 * every value of the table) unless a parameter or local shadows the name.
 *
 * Blind spots, counted rather than hidden: an id-bearing prop whose value arrives
 * through a prop, a call result or a local variable is not seen where it is used,
 * only where the literal is written. Each such occurrence is reported in
 * `unresolved`, and `test/fixtures/testid-unresolved-count.json` pins how many
 * there are. Not followed at all: the concrete values behind `<param>`, and
 * nested copy tables (`COPY.group.label`).
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const checks = require('./id-checks');
const { isModuleLevelName, isStringValue, stringConstOf } = require('./lexical-scope');

/** What a `${...}` that cannot be resolved turns into. */
const PARAM = '<param>';
/** Stands in for `${testIDPrefix}` until the suffix is split off (private use). */
const PREFIX_SLOT = '\uE000';
const PREFIX_PROP = 'testIDPrefix';
const MAX_CONST_DEPTH = 4;

/**
 * @typedef {{ path: string, text: string }} SourceFile
 * @typedef {import('./id-checks').IdSets} IdSets
 * @typedef {import('./id-checks').Unresolved} Unresolved
 * @typedef {Map<string, Map<string, string[]>>} CopyTables object name, then key
 * @typedef {{ testIDs: string[], accessibilityLabels: string[], prefixes: string[], suffixes: string[], unresolved: Unresolved }} FileFindings
 * @typedef {'prefix' | 'testID' | 'label'} PairKind
 */

/** @param {string} file */
function normalisePath(file) {
  return file.replace(/\\/g, '/');
}

/**
 * Production sources only: `src/**` TypeScript, no tests, no declarations.
 * @param {string} file path relative to the app root
 */
function isSourceFile(file) {
  const normal = normalisePath(file);
  return (
    normal.startsWith('src/') &&
    /\.tsx?$/.test(normal) &&
    !/\.d\.ts$/.test(normal) &&
    !/\.test\.tsx?$/.test(normal) &&
    !/(^|\/)__tests__\//.test(normal)
  );
}

/** @param {string} text */
function hasStaticText(text) {
  return text.split(PARAM).join('').trim() !== '';
}

/** `{ ... } as const` and `{ ... } satisfies T` are the object inside. */
function unwrapObject(/** @type {ts.Expression} */ expression) {
  let inner = expression;
  while (ts.isAsExpression(inner) || ts.isSatisfiesExpression(inner)) {
    inner = inner.expression;
  }
  return ts.isObjectLiteralExpression(inner) ? inner : null;
}

/**
 * The module-level `const NAME = { ... }` objects of a file, as [NAME, object].
 * @param {ts.SourceFile} sourceFile
 * @returns {[string, ts.ObjectLiteralExpression][]}
 */
function moduleLevelObjects(sourceFile) {
  return sourceFile.statements
    .filter(ts.isVariableStatement)
    .filter((statement) => (statement.declarationList.flags & ts.NodeFlags.Const) !== 0)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .flatMap((declaration) => {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return [];
      const object = unwrapObject(declaration.initializer);
      return object ? [[declaration.name.text, object]] : [];
    });
}

/**
 * Adds the string-valued properties of an object to a table (key -> texts).
 * @param {Map<string, string[]>} table
 * @param {ts.ObjectLiteralExpression} object
 */
function addProperties(table, object) {
  for (const property of object.properties.filter(ts.isPropertyAssignment)) {
    const { name, initializer } = property;
    if (
      (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) ||
      !isStringValue(initializer)
    ) {
      continue;
    }
    table.set(name.text, [
      ...(table.get(name.text) ?? []),
      ...stringsOf(initializer, new Map()),
    ]);
  }
}

/**
 * The string-valued properties of every module-level `const NAME = { ... }`,
 * across all sources. A name declared in two files holds the union of both.
 * @param {ts.SourceFile[]} sourceFiles
 * @returns {CopyTables}
 */
function collectCopyTables(sourceFiles) {
  /** @type {CopyTables} */
  const tables = new Map();
  for (const sourceFile of sourceFiles) {
    for (const [name, object] of moduleLevelObjects(sourceFile)) {
      const table = tables.get(name) ?? new Map();
      addProperties(table, object);
      tables.set(name, table);
    }
  }
  return tables;
}

/**
 * What one `${expression}` of a template is worth.
 * @param {ts.Expression} expression
 * @param {CopyTables} tables
 * @param {number} depth
 */
function renderSubstitution(expression, tables, depth) {
  if (!ts.isIdentifier(expression)) return PARAM;
  if (expression.text === PREFIX_PROP) return PREFIX_SLOT;
  const value = stringConstOf(expression);
  if (!value || depth >= MAX_CONST_DEPTH) return PARAM;
  return stringsOf(value, tables, depth + 1)[0] ?? PARAM;
}

/**
 * @param {ts.TemplateExpression} template
 * @param {CopyTables} tables
 * @param {number} depth
 */
function renderTemplate(template, tables, depth) {
  return template.templateSpans.reduce(
    (text, span) =>
      text + renderSubstitution(span.expression, tables, depth) + span.literal.text,
    template.head.text,
  );
}

/** Operators whose operands can be the value (`a ?? 'x'`, `ok && 'x'`). */
const VALUE_OPERATORS = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
]);

/**
 * `NAME.key`, `NAME['key']` and `NAME[expression]` against the copy tables;
 * the last stands for every value of the table.
 * @param {ts.PropertyAccessExpression | ts.ElementAccessExpression} access
 * @param {CopyTables} tables
 * @returns {string[]}
 */
function stringsOfAccess(access, tables) {
  const owner = access.expression;
  if (!ts.isIdentifier(owner) || !isModuleLevelName(owner)) return [];
  const table = tables.get(owner.text);
  if (!table) return [];
  if (ts.isPropertyAccessExpression(access)) return table.get(access.name.text) ?? [];
  const key = access.argumentExpression;
  return ts.isStringLiteralLike(key)
    ? (table.get(key.text) ?? [])
    : [...table.values()].flat();
}

/**
 * Every string an expression can evaluate to, as far as it is written down:
 * literals, templates, the branches of a conditional, the operands of `??`/`||`,
 * a string `const` in scope and a copy-table entry. Anything else (a prop, a
 * call) yields nothing.
 * @param {ts.Expression | undefined} expression
 * @param {CopyTables} tables
 * @param {number} depth
 * @returns {string[]}
 */
function stringsOf(expression, tables, depth = 0) {
  if (!expression) return [];
  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isTemplateExpression(expression)) {
    return [renderTemplate(expression, tables, depth)];
  }
  if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isElementAccessExpression(expression)
  ) {
    return stringsOfAccess(expression, tables);
  }
  if (ts.isIdentifier(expression)) {
    const value = stringConstOf(expression);
    return value && depth < MAX_CONST_DEPTH ? stringsOf(value, tables, depth + 1) : [];
  }
  if (ts.isConditionalExpression(expression)) {
    return [
      ...stringsOf(expression.whenTrue, tables, depth),
      ...stringsOf(expression.whenFalse, tables, depth),
    ];
  }
  if (
    ts.isBinaryExpression(expression) &&
    VALUE_OPERATORS.has(expression.operatorToken.kind)
  ) {
    return [
      ...stringsOf(expression.left, tables, depth),
      ...stringsOf(expression.right, tables, depth),
    ];
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return stringsOf(expression.expression, tables, depth);
  }
  return [];
}

/**
 * The name and value of a node that carries an attribute-like pair, or null:
 * a JSX attribute, a property assignment or a shorthand property.
 * @param {ts.Node} node
 * @returns {{ name: string, value: ts.Expression | undefined } | null}
 */
function readPair(node) {
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
    const init = node.initializer;
    const value = init && ts.isJsxExpression(init) ? init.expression : init;
    return { name: node.name.text, value };
  }
  if (
    ts.isPropertyAssignment(node) &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
  ) {
    return { name: node.name.text, value: node.initializer };
  }
  if (ts.isShorthandPropertyAssignment(node)) {
    return { name: node.name.text, value: node.name };
  }
  return null;
}

/**
 * What a property name stands for: the prefix a component builds ids from, a
 * testID (`testID`, `tabBarButtonTestID`) or an accessible name.
 * @param {string} name
 * @returns {PairKind | null}
 */
function kindOf(name) {
  if (name === PREFIX_PROP) return 'prefix';
  if (name === 'testID' || /TestID$/.test(name)) return 'testID';
  if (name === 'accessibilityLabel' || name === 'aria-label') return 'label';
  return null;
}

/**
 * Splits a rendered testID into a finished id or a suffix built from
 * `testIDPrefix`, recorded for later crossing with every prefix.
 * @param {string} rendered
 * @param {FileFindings} findings
 * @returns {boolean} whether it yielded anything
 */
function recordTestID(rendered, findings) {
  if (rendered.startsWith(PREFIX_SLOT)) {
    const suffix = rendered.slice(PREFIX_SLOT.length).split(PREFIX_SLOT).join(PARAM);
    if (!hasStaticText(suffix)) return false;
    findings.suffixes.push(suffix);
    return true;
  }
  const id = rendered.split(PREFIX_SLOT).join(PARAM);
  findings.testIDs.push(id);
  return hasStaticText(id);
}

/**
 * Files one pair under what it carries, and reports an occurrence that yielded
 * nothing as unresolved.
 * @param {FileFindings} findings
 * @param {ts.SourceFile} sourceFile
 * @param {{ name: string, value: ts.Expression | undefined }} pair
 * @param {PairKind} kind
 * @param {CopyTables} tables
 */
function recordPair(findings, sourceFile, pair, kind, tables) {
  const texts = stringsOf(pair.value, tables);
  let read = 0;
  if (kind === 'testID') {
    read = texts.filter((text) => recordTestID(text, findings)).length;
  } else {
    const usable = texts.filter(hasStaticText);
    (kind === 'prefix' ? findings.prefixes : findings.accessibilityLabels).push(
      ...usable,
    );
    read = usable.length;
  }
  if (!pair.value || read > 0) return;
  const start = pair.value.getStart(sourceFile);
  findings.unresolved[kind === 'label' ? 'accessibilityLabels' : 'testIDs'].push({
    path: sourceFile.fileName,
    line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
    name: pair.name,
    text: pair.value.getText(sourceFile),
  });
}

/**
 * @param {ts.SourceFile} sourceFile
 * @param {CopyTables} tables
 * @returns {FileFindings}
 */
function scanFile(sourceFile, tables) {
  /** @type {FileFindings} */
  const findings = {
    testIDs: [],
    accessibilityLabels: [],
    prefixes: [],
    suffixes: [],
    unresolved: { testIDs: [], accessibilityLabels: [] },
  };
  const visit = (/** @type {ts.Node} */ node) => {
    const pair = readPair(node);
    const kind = pair ? kindOf(pair.name) : null;
    if (pair && kind) recordPair(findings, sourceFile, pair, kind, tables);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

/** @param {SourceFile} file */
function parse(file) {
  const kind = file.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(
    normalisePath(file.path),
    file.text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
}

/** @param {Iterable<string>} values */
function sortedUnique(values) {
  return [...new Set(values)].filter(hasStaticText).sort();
}

/**
 * Extracts every testID and static accessible name from the given sources, and
 * lists the id-bearing props it could not read. Paths are relative to the app
 * root (`src/...`); tests and declaration files are skipped.
 * @param {SourceFile[]} files
 * @returns {{ ids: IdSets, unresolved: Unresolved }}
 */
function analyseSources(files) {
  const sourceFiles = files.filter((file) => isSourceFile(file.path)).map(parse);
  const tables = collectCopyTables(sourceFiles);
  const testIDs = [];
  const accessibilityLabels = [];
  const prefixes = new Set();
  const suffixes = new Set();
  const unresolved = { testIDs: [], accessibilityLabels: [] };

  for (const sourceFile of sourceFiles) {
    const findings = scanFile(sourceFile, tables);
    testIDs.push(...findings.testIDs);
    accessibilityLabels.push(...findings.accessibilityLabels);
    findings.prefixes.forEach((prefix) => prefixes.add(prefix));
    findings.suffixes.forEach((suffix) => suffixes.add(suffix));
    unresolved.testIDs.push(...findings.unresolved.testIDs);
    unresolved.accessibilityLabels.push(...findings.unresolved.accessibilityLabels);
  }
  for (const prefix of prefixes) {
    for (const suffix of suffixes) testIDs.push(prefix + suffix);
  }
  return {
    ids: {
      testIDs: sortedUnique(testIDs),
      accessibilityLabels: sortedUnique(accessibilityLabels),
    },
    unresolved,
  };
}

/**
 * The ids alone.
 * @param {SourceFile[]} files
 * @returns {IdSets}
 */
function extractFromSources(files) {
  return analyseSources(files).ids;
}

/**
 * Reads `<appRoot>/src` from disk, as `{ path: 'src/...', text }`.
 * @param {string} appRoot
 * @returns {SourceFile[]}
 */
function readWorkingTreeSources(appRoot) {
  /** @type {SourceFile[]} */
  const files = [];
  const walk = (/** @type {string} */ relative) => {
    for (const entry of fs.readdirSync(path.join(appRoot, relative), {
      withFileTypes: true,
    })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (isSourceFile(child)) {
        files.push({
          path: child,
          text: fs.readFileSync(path.join(appRoot, child), 'utf8'),
        });
      }
    }
  };
  walk('src');
  return files;
}

module.exports = {
  ...checks,
  PARAM,
  analyseSources,
  extractFromSources,
  isSourceFile,
  readWorkingTreeSources,
};
