'use strict';

/**
 * The `id:` selectors of the Maestro flows in `e2e/` and whether the extracted
 * ids can serve them (feature 004, T414; FR-037).
 *
 * A flow finds a control by `id: 'trip-open-notes'`, and Maestro reads the value
 * as a regular expression, so the flows also write `document-row-.*`,
 * `anchor-country:*` and `trip-open-${SEGMENT}` (a flow variable). The extractor
 * knows ids as written (`trip-open-notes`) and as patterns (`trip-open-<param>`,
 * where `<param>` stands for one or more non-space characters). A selector is
 * served when some extracted id can be a string the selector matches; for a
 * regular-expression selector that is decided on a permissive reading of the
 * expression (a group, a class or a quantified character becomes "anything"), so
 * a selector is only reported when no id could possibly match it.
 */

const fs = require('node:fs');
const path = require('node:path');

const { PARAM } = require('./extract-ids');

/** Maestro's own `id:` values for system dialogs, not ours. */
const SYSTEM_ID = /^android:id\//;

/**
 * A block (`id:` at the start of the line, after an optional `- `) or an inline
 * (`{ id: ... }`) selector, with its quoted or bare value.
 */
const ID_SELECTOR =
  /(?:^\s*(?:-\s+)?|[{,]\s*)id:\s*(?:'([^']*)'|"([^"]*)"|([^\s#,}'"][^\s#,}]*))/g;

/**
 * @param {string} yaml the text of a Maestro flow
 * @returns {string[]} its `id:` selectors, as written, in order
 */
function extractMaestroSelectors(yaml) {
  return yaml
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .flatMap((line) => [...line.matchAll(ID_SELECTOR)])
    .map((match) => match[1] ?? match[2] ?? match[3])
    .filter((selector) => selector && !SYSTEM_ID.test(selector));
}

/**
 * Every selector of every flow under `<appRoot>/e2e`, with the flow it is in.
 * @param {string} appRoot
 * @returns {{ selector: string, file: string }[]}
 */
function readMaestroSelectors(appRoot) {
  /** @type {{ selector: string, file: string }[]} */
  const entries = [];
  const walk = (/** @type {string} */ relative) => {
    for (const item of fs.readdirSync(path.join(appRoot, relative), {
      withFileTypes: true,
    })) {
      const child = `${relative}/${item.name}`;
      if (item.isDirectory()) walk(child);
      else if (/\.ya?ml$/.test(item.name)) {
        const text = fs.readFileSync(path.join(appRoot, child), 'utf8');
        for (const selector of new Set(extractMaestroSelectors(text))) {
          entries.push({ selector, file: child });
        }
      }
    }
  };
  walk('e2e');
  return entries;
}

/**
 * A pattern is a sequence of tokens: a literal character, `one` (any single
 * character) or `many` (any run, possibly empty). `param` marks the ones that
 * stand for `<param>`, which never cover whitespace.
 * @typedef {{ literal: string } | { wild: 'one' | 'many', param: boolean }} Token
 */

/**
 * An extracted id as tokens, `<param>` being one or more non-space characters.
 * @param {string} id
 * @returns {Token[]}
 */
function tokensOfId(id) {
  return id.split(PARAM).flatMap((piece, index) => [
    ...(index > 0
      ? [
          { wild: 'one', param: true },
          { wild: 'many', param: true },
        ]
      : []),
    ...[...piece].map((literal) => ({ literal })),
  ]);
}

/**
 * The index just past the bracket or brace that closes the one at `start`.
 * @param {string} text
 * @param {number} start
 * @param {string} open
 * @param {string} close
 */
function skipPast(text, start, open, close) {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === open) depth += 1;
    else if (text[index] === close && (depth -= 1) === 0) return index + 1;
  }
  return text.length;
}

/**
 * One regular-expression atom at `index` as a token, and where it ends. Groups
 * and classes are read as "anything": the check must not report a selector that
 * could match.
 * @param {string} selector
 * @param {number} index
 * @returns {{ token: Token | null, end: number }}
 */
function readAtom(selector, index) {
  const char = selector[index];
  if (selector.startsWith('${', index)) {
    return {
      token: { wild: 'many', param: false },
      end: skipPast(selector, index + 1, '{', '}'),
    };
  }
  if (char === '\\')
    return { token: { literal: selector[index + 1] ?? '' }, end: index + 2 };
  if (char === '(') {
    return {
      token: { wild: 'many', param: false },
      end: skipPast(selector, index, '(', ')'),
    };
  }
  if (char === '[') {
    return {
      token: { wild: 'one', param: false },
      end: skipPast(selector, index, '[', ']'),
    };
  }
  if (char === '.') return { token: { wild: 'one', param: false }, end: index + 1 };
  if (char === '^' || char === '$') return { token: null, end: index + 1 };
  return { token: { literal: char }, end: index + 1 };
}

/**
 * A selector as tokens. A quantifier (`*`, `+`, `?`, `{n,m}`) makes its atom
 * "anything".
 * @param {string} selector one alternative, with no top-level `|`
 * @returns {Token[]}
 */
function tokensOfSelector(selector) {
  /** @type {Token[]} */
  const tokens = [];
  let index = 0;
  while (index < selector.length) {
    const { token, end } = readAtom(selector, index);
    index = end;
    const quantified = /[*+?{]/.test(selector[index] ?? '');
    if (quantified) {
      index = selector[index] === '{' ? skipPast(selector, index, '{', '}') : index + 1;
      if (selector[index] === '?') index += 1;
    }
    if (token) tokens.push(quantified ? { wild: 'many', param: false } : token);
  }
  return tokens;
}

/** @param {string} selector the parts of `a|b` outside any group or class */
function alternatives(selector) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === '\\') index += 1;
    else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth -= 1;
    else if (char === '|' && depth === 0) {
      parts.push(selector.slice(start, index));
      start = index + 1;
    }
  }
  return [...parts, selector.slice(start)];
}

/** @param {Token} token */
const isMany = (token) => 'wild' in token && token.wild === 'many';
/** @param {Token} token */
const isSpace = (token) => 'literal' in token && /\s/.test(token.literal);

/** Whether a wildcard may stand for a token (a `<param>` never covers a space). */
function canCover(/** @type {Token} */ wild, /** @type {Token} */ token) {
  return !('param' in wild && wild.param && isSpace(token));
}

/** Whether two single tokens can be the same character. */
function sameCharacter(/** @type {Token} */ a, /** @type {Token} */ b) {
  if ('literal' in a && 'literal' in b) return a.literal === b.literal;
  if ('wild' in a && 'wild' in b) return true;
  const [wild, literal] = 'wild' in a ? [a, b] : [b, a];
  return canCover(wild, literal);
}

/**
 * Whether some string matches both token sequences.
 * @param {Token[]} a
 * @param {Token[]} b
 */
function overlaps(a, b) {
  /** @type {Map<number, boolean>} */
  const memo = new Map();
  const go = (/** @type {number} */ i, /** @type {number} */ j) => {
    const key = i * (b.length + 1) + j;
    if (!memo.has(key)) memo.set(key, step(i, j));
    return memo.get(key);
  };
  const step = (/** @type {number} */ i, /** @type {number} */ j) => {
    const x = a[i];
    const y = b[j];
    if (!x && !y) return true;
    if (x && isMany(x)) return go(i + 1, j) || (!!y && canCover(x, y) && go(i, j + 1));
    if (y && isMany(y)) return go(i, j + 1) || (!!x && canCover(y, x) && go(i + 1, j));
    return !!x && !!y && sameCharacter(x, y) && go(i + 1, j + 1);
  };
  return go(0, 0);
}

/**
 * Whether some extracted id (written out, or a `<param>` pattern) can be matched
 * by a Maestro selector.
 * @param {string} selector
 * @param {string[]} ids
 */
function selectorResolves(selector, ids) {
  const idTokens = ids.map(tokensOfId);
  return alternatives(selector).some((alternative) => {
    const tokens = tokensOfSelector(alternative);
    return idTokens.some((candidate) => overlaps(tokens, candidate));
  });
}

/**
 * The selectors nothing serves, each with the flow that uses it.
 * @param {{ selector: string, file: string }[]} entries
 * @param {string[]} ids
 */
function findUnresolvedSelectors(entries, ids) {
  return entries.filter((entry) => !selectorResolves(entry.selector, ids));
}

/**
 * A readable report of the selectors nothing serves, or '' when there are none.
 * @param {{ selector: string, file: string }[]} unresolved
 */
function formatUnresolvedSelectors(unresolved) {
  if (unresolved.length === 0) return '';
  /** @type {Map<string, string[]>} */
  const flows = new Map();
  for (const { selector, file } of unresolved) {
    flows.set(selector, [...(flows.get(selector) ?? []), file]);
  }
  const lines = [...flows].map(
    ([selector, files]) => `  - ${selector}  (${files.join(', ')})`,
  );
  return [
    'Maestro flows look for ids the tree no longer builds (FR-037):',
    ...lines,
    '',
    'Restore the id, or edit the flow in the same change and say so in specs/004-app-ui-redesign/tasks.md.',
  ].join('\n');
}

module.exports = {
  extractMaestroSelectors,
  findUnresolvedSelectors,
  formatUnresolvedSelectors,
  readMaestroSelectors,
  selectorResolves,
};
