'use strict';

/**
 * Static extraction of testIDs and accessible names from the app's sources
 * (feature 004, T414; FR-037, SC-003).
 *
 * The single implementation behind `scripts/testid-baseline.mjs` (which writes
 * and checks the baseline from the command line) and `test/testid-parity.test.ts`
 * (which fails the build when the tree loses one). It is CommonJS on purpose:
 * Jest's `jest-expo` transform only covers `.js`/`.ts` files, so a `.mjs` module
 * could not be imported by the test.
 *
 * It parses with the TypeScript compiler API (already a dev dependency), so
 * comments, JSX text and nested template literals cannot fool it the way a
 * regular expression could.
 *
 * What it reads, from `src/**\/*.{ts,tsx}` minus tests and declaration files:
 *
 * - `testID="x"`, `testID={'x'}`, `testID={`x-${y}`}`, and the branches of a
 *   conditional or the fallback of `??` / `||` inside the braces;
 * - object properties `testID: 'x'` / `testID: `x-${y}``;
 * - `accessibilityLabel` in the same attribute and property forms;
 * - ids built from a `testIDPrefix` (`<FormActions testIDPrefix="add-trip" />`):
 *   every prefix is crossed with every suffix a component builds from its own
 *   `testIDPrefix` prop (`${testIDPrefix}-cancel`, `${testIDPrefix}-save`).
 *
 * Every `${...}` of a template becomes `<param>` (`trip-card-<param>`), except
 * an identifier that is a same-file `const` holding a string or template, which
 * is substituted (`const base = `notice-${id}`` makes `${base}-open` read
 * `notice-<param>-open`).
 *
 * Names kept in a copy table are followed too: `COPY.retry` and `LABELS[kind]`
 * resolve through a module-level `const COPY = { retry: 'Try again' }` found in
 * any source file, matched by the object's name alone (`LABELS[kind]` stands for
 * every value of the table).
 *
 * Blind spots, by design: a value that arrives through a prop, a call result or
 * a local variable is not seen where it is used, only where the literal is
 * written; the concrete values behind `<param>` are not enumerated; and nested
 * copy tables (`COPY.group.label`) are not followed.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/** What a `${...}` that cannot be resolved turns into. */
const PARAM = '<param>';
/** Stands in for `${testIDPrefix}` until the suffix is split off (private use). */
const PREFIX_SLOT = '\uE000';
const PREFIX_PROP = 'testIDPrefix';
const MAX_CONST_DEPTH = 4;

const LIST_KEYS = /** @type {const} */ (['testIDs', 'accessibilityLabels']);

/**
 * @typedef {{ testIDs: string[], accessibilityLabels: string[] }} IdSets
 * @typedef {{ id: string, reason: string }} AllowlistEntry
 * @typedef {{ testIDs: AllowlistEntry[], accessibilityLabels: AllowlistEntry[] }} Allowlist
 * @typedef {{ path: string, text: string }} SourceFile
 * @typedef {Map<string, ts.Expression>} Consts same-file string constants, by name
 * @typedef {Map<string, Map<string, string[]>>} CopyTables object name, then key
 * @typedef {{ consts: Consts, tables: CopyTables }} Scope
 * @typedef {{ testIDs: string[], accessibilityLabels: string[], prefixes: string[], suffixes: string[] }} FileFindings
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

/**
 * @param {ts.Node} node
 * @returns {node is ts.VariableDeclaration}
 */
function isConstDeclaration(node) {
  return (
    ts.isVariableDeclaration(node) &&
    (ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) !== 0
  );
}

/** @param {ts.Expression} expression */
function isStringValue(expression) {
  return ts.isStringLiteralLike(expression) || ts.isTemplateExpression(expression);
}

/**
 * The same-file `const name = <string | template>` declarations, by name. A name
 * declared twice is ambiguous and left out.
 * @param {ts.SourceFile} sourceFile
 * @returns {Consts}
 */
function collectConsts(sourceFile) {
  /** @type {Map<string, ts.Expression | null>} */
  const found = new Map();
  const visit = (/** @type {ts.Node} */ node) => {
    if (
      isConstDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isStringValue(node.initializer)
    ) {
      found.set(node.name.text, found.has(node.name.text) ? null : node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return new Map([...found].filter(([, value]) => value !== null));
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
    .flatMap((statement) => [...statement.declarationList.declarations])
    .flatMap((declaration) => {
      if (!isConstDeclaration(declaration) || !declaration.initializer) return [];
      if (!ts.isIdentifier(declaration.name)) return [];
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
  const emptyScope = { consts: new Map(), tables: new Map() };
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
      ...stringsOf(initializer, emptyScope),
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
 * @param {Scope} scope
 * @param {number} depth
 */
function renderSubstitution(expression, scope, depth) {
  if (!ts.isIdentifier(expression)) return PARAM;
  if (expression.text === PREFIX_PROP) return PREFIX_SLOT;
  const value = scope.consts.get(expression.text);
  if (!value || depth >= MAX_CONST_DEPTH) return PARAM;
  return stringsOf(value, scope, depth + 1)[0] ?? PARAM;
}

/**
 * @param {ts.TemplateExpression} template
 * @param {Scope} scope
 * @param {number} depth
 */
function renderTemplate(template, scope, depth) {
  return template.templateSpans.reduce(
    (text, span) =>
      text + renderSubstitution(span.expression, scope, depth) + span.literal.text,
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
 * @param {Scope} scope
 * @returns {string[]}
 */
function stringsOfAccess(access, scope) {
  if (!ts.isIdentifier(access.expression)) return [];
  const table = scope.tables.get(access.expression.text);
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
 * a same-file string `const` and a copy-table entry. Anything else (a prop, a
 * call) yields nothing.
 * @param {ts.Expression | undefined} expression
 * @param {Scope} scope
 * @param {number} depth
 * @returns {string[]}
 */
function stringsOf(expression, scope, depth = 0) {
  if (!expression) return [];
  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isTemplateExpression(expression))
    return [renderTemplate(expression, scope, depth)];
  if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isElementAccessExpression(expression)
  ) {
    return stringsOfAccess(expression, scope);
  }
  if (ts.isIdentifier(expression)) {
    const value = scope.consts.get(expression.text);
    return value && depth < MAX_CONST_DEPTH ? stringsOf(value, scope, depth + 1) : [];
  }
  if (ts.isConditionalExpression(expression)) {
    return [
      ...stringsOf(expression.whenTrue, scope, depth),
      ...stringsOf(expression.whenFalse, scope, depth),
    ];
  }
  if (
    ts.isBinaryExpression(expression) &&
    VALUE_OPERATORS.has(expression.operatorToken.kind)
  ) {
    return [
      ...stringsOf(expression.left, scope, depth),
      ...stringsOf(expression.right, scope, depth),
    ];
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return stringsOf(expression.expression, scope, depth);
  }
  return [];
}

/**
 * The name and value of a node that carries an attribute-like pair, or null.
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
  return null;
}

/**
 * Splits a rendered testID into a finished id or a suffix built from
 * `testIDPrefix`, recorded for later crossing with every prefix.
 * @param {string} rendered
 * @param {FileFindings} findings
 */
function recordTestID(rendered, findings) {
  if (rendered.startsWith(PREFIX_SLOT)) {
    const suffix = rendered.slice(PREFIX_SLOT.length).split(PREFIX_SLOT).join(PARAM);
    if (hasStaticText(suffix)) findings.suffixes.push(suffix);
    return;
  }
  findings.testIDs.push(rendered.split(PREFIX_SLOT).join(PARAM));
}

/**
 * @param {ts.SourceFile} sourceFile
 * @param {CopyTables} tables
 * @returns {FileFindings}
 */
function scanFile(sourceFile, tables) {
  const scope = { consts: collectConsts(sourceFile), tables };
  /** @type {FileFindings} */
  const findings = { testIDs: [], accessibilityLabels: [], prefixes: [], suffixes: [] };

  const visit = (/** @type {ts.Node} */ node) => {
    const pair = readPair(node);
    if (pair?.name === PREFIX_PROP) {
      findings.prefixes.push(...stringsOf(pair.value, scope));
    } else if (pair?.name === 'testID') {
      for (const text of stringsOf(pair.value, scope)) recordTestID(text, findings);
    } else if (pair?.name === 'accessibilityLabel') {
      findings.accessibilityLabels.push(...stringsOf(pair.value, scope));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

/** @param {SourceFile} file */
function parse(file) {
  const kind = file.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, kind);
}

/** @param {Iterable<string>} values */
function sortedUnique(values) {
  return [...new Set(values)].filter(hasStaticText).sort();
}

/**
 * Extracts every testID and static accessible name from the given sources.
 * Paths are relative to the app root (`src/...`); tests and declaration files
 * are skipped.
 * @param {SourceFile[]} files
 * @returns {IdSets}
 */
function extractFromSources(files) {
  const sourceFiles = files.filter((file) => isSourceFile(file.path)).map(parse);
  const tables = collectCopyTables(sourceFiles);
  const testIDs = [];
  const accessibilityLabels = [];
  const prefixes = new Set();
  const suffixes = new Set();

  for (const sourceFile of sourceFiles) {
    const findings = scanFile(sourceFile, tables);
    testIDs.push(...findings.testIDs);
    accessibilityLabels.push(...findings.accessibilityLabels);
    findings.prefixes.filter(hasStaticText).forEach((prefix) => prefixes.add(prefix));
    findings.suffixes.forEach((suffix) => suffixes.add(suffix));
  }
  for (const prefix of prefixes) {
    for (const suffix of suffixes) testIDs.push(prefix + suffix);
  }
  return {
    testIDs: sortedUnique(testIDs),
    accessibilityLabels: sortedUnique(accessibilityLabels),
  };
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

/**
 * Baseline items the current extraction no longer has and the allowlist does
 * not excuse. Extra items in the current tree are fine.
 * @param {IdSets} baseline
 * @param {IdSets} current
 * @param {Allowlist} allowlist
 * @returns {IdSets}
 */
function findMissing(baseline, current, allowlist) {
  const missing = { testIDs: [], accessibilityLabels: [] };
  for (const key of LIST_KEYS) {
    const present = new Set(current[key]);
    const excused = new Set(allowlist[key].map((entry) => entry.id));
    missing[key] = baseline[key].filter((id) => !present.has(id) && !excused.has(id));
  }
  return missing;
}

/**
 * A readable report of what is missing, or '' when nothing is.
 * @param {IdSets} missing
 */
function formatMissing(missing) {
  const sections = [
    ['testIDs', missing.testIDs],
    ['accessibility labels', missing.accessibilityLabels],
  ].filter(([, ids]) => ids.length > 0);
  if (sections.length === 0) return '';
  const body = sections.map(
    ([title, ids]) =>
      `${title} (${ids.length}):\n${ids.map((id) => `  - ${id}`).join('\n')}`,
  );
  return [
    'Present before the redesign (tag pre-004-baseline), missing from the tree now (FR-037, SC-003):',
    '',
    body.join('\n\n'),
    '',
    'Restore the id or name, or record why it went in test/testid-parity.allowlist.json',
    '({ "id", "reason" }) and in specs/004-app-ui-redesign/tasks.md, with the matching Maestro edit.',
  ].join('\n');
}

/**
 * @param {unknown} entry
 * @param {Set<string>} inBaseline
 * @param {Set<string>} inTree
 * @returns {string | null} the problem, or null
 */
function entryProblem(entry, inBaseline, inTree) {
  const { id, reason } = /** @type {Partial<AllowlistEntry>} */ (entry ?? {});
  if (typeof id !== 'string' || id === '')
    return `entry ${JSON.stringify(entry)} needs an "id"`;
  if (typeof reason !== 'string' || reason.trim() === '')
    return `"${id}" needs a "reason"`;
  if (!inBaseline.has(id)) return `"${id}" was never in the baseline; remove the entry`;
  if (inTree.has(id)) return `"${id}" is back in the tree; remove the entry`;
  return null;
}

/**
 * Problems with the allowlist file itself: wrong shape, an entry without a
 * reason, an id the baseline never had (a typo excuses nothing), or an id that
 * is present again (a stale exception hides a later regression).
 * @param {unknown} allowlist
 * @param {IdSets} baseline
 * @param {IdSets} current
 * @returns {string[]}
 */
function validateAllowlist(allowlist, baseline, current) {
  const problems = [];
  for (const key of LIST_KEYS) {
    const entries = /** @type {Record<string, unknown> | null} */ (allowlist)?.[key];
    if (!Array.isArray(entries)) {
      problems.push(`"${key}" must be an array of { "id", "reason" }`);
      continue;
    }
    const inBaseline = new Set(baseline[key]);
    const inTree = new Set(current[key]);
    for (const entry of entries) {
      const problem = entryProblem(entry, inBaseline, inTree);
      if (problem) problems.push(`${key}: ${problem}`);
    }
  }
  return problems;
}

module.exports = {
  PARAM,
  extractFromSources,
  findMissing,
  formatMissing,
  isSourceFile,
  readWorkingTreeSources,
  validateAllowlist,
};
