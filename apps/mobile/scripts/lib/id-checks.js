'use strict';

/**
 * The comparison half of the parity guard (feature 004, T414): what is missing
 * from the tree, what an allowlist entry must say, what binds the baseline to its
 * tag and whether the count of props the extractor cannot read has drifted.
 * Re-exported by `extract-ids.js`, which is what callers import.
 */

/** The only tag a committed baseline may be taken from. */
const BASELINE_REF = 'pre-004-baseline';

const LIST_KEYS = /** @type {const} */ (['testIDs', 'accessibilityLabels']);
const LIST_TITLES = { testIDs: 'testIDs', accessibilityLabels: 'accessibility labels' };
const ENTRY_KEYS = ['id', 'reason'];
const BASELINE_KEYS = ['source', ...LIST_KEYS];
const SOURCE_KEYS = ['ref', 'sha'];
/** A task of `specs/004-app-ui-redesign/tasks.md`: T and exactly three digits. */
const TASK_ID = /\bT\d{3}\b/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const UNRESOLVED_FILE = 'test/fixtures/testid-unresolved-count.json';

/**
 * @typedef {{ testIDs: string[], accessibilityLabels: string[] }} IdSets
 * @typedef {{ id: string, reason: string }} AllowlistEntry
 * @typedef {{ testIDs: AllowlistEntry[], accessibilityLabels: AllowlistEntry[] }} Allowlist
 * @typedef {{ path: string, line: number, name: string, text: string }} UnresolvedOccurrence
 * @typedef {{ testIDs: UnresolvedOccurrence[], accessibilityLabels: UnresolvedOccurrence[] }} Unresolved
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {Record<string, unknown>} object
 * @param {readonly string[]} allowed
 * @returns {string[]} the keys that are not allowed
 */
function unknownKeys(object, allowed) {
  return Object.keys(object).filter((key) => !allowed.includes(key));
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
  const sections = LIST_KEYS.map((key) => [LIST_TITLES[key], missing[key]]).filter(
    ([, ids]) => ids.length > 0,
  );
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
    '({ "id", "reason" naming the task }) and in specs/004-app-ui-redesign/tasks.md, with the',
    'matching Maestro edit.',
  ].join('\n');
}

/**
 * @param {unknown} entry
 * @param {Set<string>} inBaseline
 * @param {Set<string>} inTree
 * @param {Set<string>} seen ids already listed in this list
 * @returns {string[]} what is wrong with the entry
 */
function entryProblems(entry, inBaseline, inTree, seen) {
  if (!isPlainObject(entry))
    return [`entry ${JSON.stringify(entry)} must be { "id", "reason" }`];
  const { id, reason } = entry;
  if (typeof id !== 'string' || id === '')
    return [`entry ${JSON.stringify(entry)} needs an "id"`];
  const problems = unknownKeys(entry, ENTRY_KEYS).map(
    (key) => `"${id}" has an unknown key "${key}"`,
  );
  if (typeof reason !== 'string' || reason.trim() === '') {
    problems.push(`"${id}" needs a "reason"`);
  } else if (!TASK_ID.test(reason)) {
    problems.push(`"${id}": the "reason" must name the task (a task id such as T432)`);
  }
  if (seen.has(id)) problems.push(`"${id}" is listed twice`);
  seen.add(id);
  if (!inBaseline.has(id))
    problems.push(`"${id}" was never in the baseline; remove the entry`);
  if (inTree.has(id)) problems.push(`"${id}" is back in the tree; remove the entry`);
  return problems;
}

/**
 * Problems with the allowlist file itself: wrong shape, an unknown key, an entry
 * without a reason that names a task, an id listed twice, an id the baseline
 * never had (a typo excuses nothing) or one that is present again (a stale
 * exception hides a later regression).
 * @param {unknown} allowlist
 * @param {IdSets} baseline
 * @param {IdSets} current
 * @returns {string[]}
 */
function validateAllowlist(allowlist, baseline, current) {
  if (!isPlainObject(allowlist)) {
    return ['the allowlist must be { "testIDs": [...], "accessibilityLabels": [...] }'];
  }
  const problems = unknownKeys(allowlist, LIST_KEYS).map(
    (key) => `unknown key "${key}" (only ${LIST_KEYS.join(' and ')} are allowed)`,
  );
  for (const key of LIST_KEYS) {
    const entries = allowlist[key];
    if (!Array.isArray(entries)) {
      problems.push(`"${key}" must be an array of { "id", "reason" }`);
      continue;
    }
    const inBaseline = new Set(baseline[key]);
    const inTree = new Set(current[key]);
    const seen = new Set();
    for (const entry of entries) {
      for (const problem of entryProblems(entry, inBaseline, inTree, seen)) {
        problems.push(`${key}: ${problem}`);
      }
    }
  }
  return problems;
}

/**
 * @param {unknown} source
 * @returns {string[]}
 */
function sourceProblems(source) {
  if (!isPlainObject(source)) {
    return [`"source" must be { "ref": "${BASELINE_REF}", "sha": "<40 hex digits>" }`];
  }
  const problems = unknownKeys(source, SOURCE_KEYS).map(
    (key) => `"source" has an unknown key "${key}"`,
  );
  if (source.ref !== BASELINE_REF) {
    problems.push(
      `"source.ref" must be "${BASELINE_REF}", not ${JSON.stringify(source.ref)}`,
    );
  }
  if (typeof source.sha !== 'string' || !FULL_SHA.test(source.sha)) {
    problems.push(
      '"source.sha" must be the 40-digit lower-case commit id the tag points at',
    );
  }
  return problems;
}

/**
 * Problems with the baseline file: not bound to the tag by commit, unknown keys,
 * or lists that are not sorted, unique strings.
 * @param {unknown} baseline
 * @returns {string[]}
 */
function validateBaseline(baseline) {
  if (!isPlainObject(baseline)) return ['the baseline must be a JSON object'];
  const problems = [
    ...unknownKeys(baseline, BASELINE_KEYS).map((key) => `unknown key "${key}"`),
    ...sourceProblems(baseline.source),
  ];
  for (const key of LIST_KEYS) {
    const list = baseline[key];
    if (!Array.isArray(list) || list.some((item) => typeof item !== 'string')) {
      problems.push(`"${key}" must be an array of strings`);
    } else if (JSON.stringify([...new Set(list)].sort()) !== JSON.stringify(list)) {
      problems.push(`"${key}" must be sorted and free of duplicates`);
    }
  }
  return problems;
}

/**
 * @param {string} title
 * @param {number} stored
 * @param {UnresolvedOccurrence[]} found
 * @returns {string}
 */
function unresolvedDrift(title, stored, found) {
  if (found.length === stored) return '';
  const head = `${title}: ${stored} stored, ${found.length} found`;
  if (found.length < stored) {
    return `${head}. The stored count is stale: lower it to ${found.length}.`;
  }
  const lines = found.map((o) => `  - ${o.path}:${o.line} ${o.name}={${o.text}}`);
  return `${head}. Props the extractor cannot read hide their ids from the guard:\n${lines.join('\n')}`;
}

/**
 * '' when the number of id-bearing props the extractor could not read matches the
 * stored count, else what drifted. The stored count moves only on purpose: more
 * unread props mean ids the guard no longer sees.
 * @param {{ testIDs: number, accessibilityLabels: number }} stored
 * @param {Unresolved} unresolved
 * @returns {string}
 */
function compareUnresolved(stored, unresolved) {
  const drift = LIST_KEYS.map((key) =>
    Number.isInteger(stored?.[key])
      ? unresolvedDrift(LIST_TITLES[key], stored[key], unresolved[key])
      : `${LIST_TITLES[key]}: no stored count in ${UNRESOLVED_FILE}`,
  ).filter(Boolean);
  if (drift.length === 0) return '';
  return [
    ...drift,
    '',
    `If that is intended (an adapter that forwards its testID prop, say), set the count in ${UNRESOLVED_FILE}`,
    'with `node scripts/testid-baseline.mjs --write-unresolved test/fixtures/testid-unresolved-count.json`,',
    'and say why in the commit. Otherwise write the id where the extractor can read it.',
  ].join('\n');
}

module.exports = {
  BASELINE_REF,
  LIST_KEYS,
  UNRESOLVED_FILE,
  compareUnresolved,
  findMissing,
  formatMissing,
  validateAllowlist,
  validateBaseline,
};
