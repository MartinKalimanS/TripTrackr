'use strict';

/**
 * Which declaration a name refers to, by lexical scope (feature 004, T414).
 *
 * The extractor follows `const base = 'x'` through `testID={`${base}-open`}`.
 * Matching by name alone would read a prop that happens to share the name of
 * another function's const (a phantom id) or give up when two functions each
 * declare their own `base` (a dropped id). So an identifier is resolved the way
 * the language does: the nearest enclosing scope that declares it wins.
 *
 * Scopes read: the file, blocks, functions (parameters), `for` heads and `catch`
 * clauses. `var` hoisting is not modelled; nothing in the app relies on it.
 */

const ts = require('typescript');

/**
 * @typedef {{ level: 'module' | 'local' | 'import', declaration: ts.Node }} Binding
 */

/** @type {WeakMap<ts.Node, Map<string, Binding>>} */
const declarationCache = new WeakMap();

/** @param {ts.Expression} expression */
function isStringValue(expression) {
  return ts.isStringLiteralLike(expression) || ts.isTemplateExpression(expression);
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

/** @param {ts.Node} node */
function isScope(node) {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isModuleBlock(node) ||
    ts.isCaseBlock(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isCatchClause(node)
  );
}

/**
 * Every name a binding name introduces: `a`, `{ a, b: [c] }`.
 * @param {ts.BindingName} name
 * @returns {string[]}
 */
function namesIn(name) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : namesIn(element.name),
  );
}

/**
 * @param {ts.Statement} statement
 * @returns {[string, ts.Node][]} the names a statement declares, with the node
 */
function declaredByStatement(statement) {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      namesIn(declaration.name).map((name) => [name, declaration]),
    );
  }
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    const bindings = clause?.namedBindings;
    const named = bindings
      ? ts.isNamespaceImport(bindings)
        ? [bindings.name]
        : bindings.elements.map((element) => element.name)
      : [];
    return [...(clause?.name ? [clause.name] : []), ...named].map((name) => [
      name.text,
      statement,
    ]);
  }
  const named =
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isEnumDeclaration(statement);
  return named && statement.name ? [[statement.name.text, statement]] : [];
}

/**
 * The names a scope node declares directly.
 * @param {ts.Node} scope
 * @returns {[string, ts.Node][]}
 */
function declaredBy(scope) {
  if (ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope)) {
    return scope.statements.flatMap(declaredByStatement);
  }
  if (ts.isCaseBlock(scope)) {
    return scope.clauses.flatMap((clause) =>
      clause.statements.flatMap(declaredByStatement),
    );
  }
  if (ts.isCatchClause(scope)) {
    const variable = scope.variableDeclaration;
    return variable ? namesIn(variable.name).map((name) => [name, variable]) : [];
  }
  if (
    ts.isForStatement(scope) ||
    ts.isForInStatement(scope) ||
    ts.isForOfStatement(scope)
  ) {
    const head = scope.initializer;
    return head && ts.isVariableDeclarationList(head)
      ? head.declarations.flatMap((declaration) =>
          namesIn(declaration.name).map((name) => [name, declaration]),
        )
      : [];
  }
  const own =
    ts.isFunctionExpression(scope) && scope.name ? [[scope.name.text, scope]] : [];
  return [
    ...own,
    ...scope.parameters.flatMap((parameter) =>
      namesIn(parameter.name).map((name) => [name, parameter]),
    ),
  ];
}

/**
 * @param {ts.Node} scope
 * @returns {Map<string, Binding>}
 */
function bindingsOf(scope) {
  const cached = declarationCache.get(scope);
  if (cached) return cached;
  /** @type {Map<string, Binding>} */
  const bindings = new Map();
  for (const [name, declaration] of declaredBy(scope)) {
    const isImport = ts.isImportDeclaration(declaration);
    const level = isImport ? 'import' : ts.isSourceFile(scope) ? 'module' : 'local';
    bindings.set(name, { level, declaration });
  }
  declarationCache.set(scope, bindings);
  return bindings;
}

/**
 * The declaration an identifier refers to: the nearest enclosing scope that
 * declares its name, or null when nothing in the file does.
 * @param {ts.Identifier} identifier
 * @returns {Binding | null}
 */
function bindingOf(identifier) {
  for (let node = identifier.parent; node; node = node.parent) {
    const found = isScope(node) ? bindingsOf(node).get(identifier.text) : undefined;
    if (found) return found;
  }
  return null;
}

/**
 * The string or template an identifier is a `const` for, or null when it is
 * anything else (a parameter, an import, a `let`, a call result).
 * @param {ts.Identifier} identifier
 * @returns {ts.Expression | null}
 */
function stringConstOf(identifier) {
  const declaration = bindingOf(identifier)?.declaration;
  return declaration &&
    isConstDeclaration(declaration) &&
    ts.isIdentifier(declaration.name) &&
    declaration.initializer &&
    isStringValue(declaration.initializer)
    ? declaration.initializer
    : null;
}

/**
 * True when a name is the file's own top-level declaration or an import, not a
 * parameter or local that shadows it.
 * @param {ts.Identifier} identifier
 */
function isModuleLevelName(identifier) {
  const binding = bindingOf(identifier);
  return binding === null || binding.level !== 'local';
}

module.exports = { isConstDeclaration, isModuleLevelName, isStringValue, stringConstOf };
