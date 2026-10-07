/**
 * Types for `extract-ids.js`, so TypeScript callers (the Jest suites) do not
 * depend on `allowJs` inferring them from JSDoc.
 */

export type SourceFile = { path: string; text: string };

export type IdSets = { testIDs: string[]; accessibilityLabels: string[] };

export type AllowlistEntry = { id: string; reason: string };

export type Allowlist = {
  testIDs: AllowlistEntry[];
  accessibilityLabels: AllowlistEntry[];
};

export type BaselineSource = { ref: string; sha: string };

export type Baseline = IdSets & { source: BaselineSource };

/** An id-bearing prop whose value the extractor could not read. */
export type UnresolvedOccurrence = {
  path: string;
  line: number;
  name: string;
  text: string;
};

export type Unresolved = {
  testIDs: UnresolvedOccurrence[];
  accessibilityLabels: UnresolvedOccurrence[];
};

/** The stored size of `Unresolved`, from `test/fixtures/testid-unresolved-count.json`. */
export type UnresolvedCount = { testIDs: number; accessibilityLabels: number };

/** What an unresolvable `${...}` of a template reads as. */
export const PARAM: '<param>';

/** The only tag a baseline may be taken from. */
export const BASELINE_REF: 'pre-004-baseline';

/** The sources the extractor reads: `src/**` TypeScript, no tests, no declarations. */
export function isSourceFile(file: string): boolean;

export function extractFromSources(files: readonly SourceFile[]): IdSets;

export function analyseSources(files: readonly SourceFile[]): {
  ids: IdSets;
  unresolved: Unresolved;
};

/** `<appRoot>/src` from disk, as `{ path: 'src/...', text }`. */
export function readWorkingTreeSources(appRoot: string): SourceFile[];

/** Baseline items the current ids lack and the allowlist does not excuse. */
export function findMissing(
  baseline: IdSets,
  current: IdSets,
  allowlist: Allowlist,
): IdSets;

/** A readable report of what is missing, or '' when nothing is. */
export function formatMissing(missing: IdSets): string;

/** What is wrong with the allowlist file (empty when nothing is). */
export function validateAllowlist(
  allowlist: unknown,
  baseline: IdSets,
  current: IdSets,
): string[];

/** What is wrong with the baseline file (empty when nothing is). */
export function validateBaseline(baseline: unknown): string[];

/** '' when the stored count matches what was found, else what drifted. */
export function compareUnresolved(
  stored: UnresolvedCount,
  unresolved: Unresolved,
): string;
