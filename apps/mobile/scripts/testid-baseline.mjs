#!/usr/bin/env node
/**
 * testID and accessible-name baseline (feature 004, T414; FR-037, SC-003).
 *
 *   node scripts/testid-baseline.mjs --from pre-004-baseline --write <file>
 *       Extract every testID and static accessible name from the sources at the
 *       tag (listed with `git ls-tree`, read with `git show`) and write them,
 *       sorted and de-duplicated, with the tag's commit:
 *       { "source": { "ref", "sha" }, "testIDs": [...], "accessibilityLabels": [...] }
 *       Any other ref is refused unless --allow-other-ref is given, and a
 *       baseline from another ref fails the parity test.
 *
 *   node scripts/testid-baseline.mjs --check <file> [--allowlist <file>]
 *                                    [--unresolved-count <file>]
 *       Run the checks of test/testid-parity.test.ts against the working tree and
 *       exit 1, printing what failed: the baseline's tag no longer points at its
 *       commit, a baseline item or a concrete tab id is missing, an `id:` selector
 *       of a Maestro flow matches nothing, or the number of id-bearing props the
 *       extractor cannot read changed. Extra items are fine. The files default to
 *       test/testid-parity.allowlist.json and
 *       test/fixtures/testid-unresolved-count.json.
 *
 *   node scripts/testid-baseline.mjs --write-unresolved <file>
 *       List the id-bearing props the extractor cannot read in the working tree
 *       and write their count to <file>.
 *
 * The extractor is `scripts/lib/extract-ids.js`, shared with the Jest suites.
 * Regenerating the committed baseline:
 *
 *   node scripts/testid-baseline.mjs --from pre-004-baseline --write test/fixtures/testid-baseline.json
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const {
  BASELINE_REF,
  analyseSources,
  compareUnresolved,
  findMissing,
  formatMissing,
  isSourceFile,
  readWorkingTreeSources,
  validateAllowlist,
  validateBaseline,
} = require('./lib/extract-ids.js');
const {
  findUnresolvedSelectors,
  formatUnresolvedSelectors,
  readMaestroSelectors,
} = require('./lib/e2e-ids.js');
const { discoverTabRoutes, withTabIds } = require('./lib/tab-routes.js');

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaults = {
  allowlist: path.join(appRoot, 'test', 'testid-parity.allowlist.json'),
  unresolvedCount: path.join(appRoot, 'test', 'fixtures', 'testid-unresolved-count.json'),
};
const usage = [
  'Usage:',
  `  node scripts/testid-baseline.mjs --from ${BASELINE_REF} --write <file> [--allow-other-ref]`,
  '  node scripts/testid-baseline.mjs --check <file> [--allowlist <file>] [--unresolved-count <file>]',
  '  node scripts/testid-baseline.mjs --write-unresolved <file>',
].join('\n');

const say = (text) => process.stdout.write(`${text}\n`);
const complain = (text) => process.stderr.write(`${text}\n`);

function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      from: { type: 'string' },
      write: { type: 'string' },
      check: { type: 'string' },
      allowlist: { type: 'string' },
      'unresolved-count': { type: 'string' },
      'write-unresolved': { type: 'string' },
      'allow-other-ref': { type: 'boolean' },
    },
  });
  return values;
}

/** Runs git; quoting of unusual path names is off so names come back verbatim. */
function git(args, cwd) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function repository() {
  const root = git(['rev-parse', '--show-toplevel'], appRoot).trim();
  const prefix = path.relative(root, appRoot).split(path.sep).join('/');
  return { root, prefix };
}

/** The commit a ref (a tag, usually) points at, or null when it is not here. */
function commitOf(ref) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], appRoot).trim();
  } catch {
    return null;
  }
}

function requireCommit(ref) {
  const sha = commitOf(ref);
  if (!sha) {
    throw new Error(
      `Cannot resolve "${ref}" to a commit. A tag that is not in this clone needs fetching first: git fetch --tags`,
    );
  }
  return sha;
}

/** The app's sources at a git ref, as { path: 'src/...', text }. */
function readSourcesAtRef(ref) {
  const { root, prefix } = repository();
  const listing = git(
    ['ls-tree', '-r', '-z', '--name-only', ref, '--', `${prefix}/src`],
    root,
  );
  return listing
    .split('\0')
    .filter(Boolean)
    .map((full) => ({ full, relative: full.slice(prefix.length + 1) }))
    .filter(({ relative }) => isSourceFile(relative))
    .map(({ full, relative }) => ({
      path: relative,
      text: git(['show', `${ref}:${full}`], root),
    }));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`);
}

function writeBaseline({ from, write, 'allow-other-ref': allowOtherRef }) {
  if (from !== BASELINE_REF && !allowOtherRef) {
    throw new Error(
      `Refusing to write a baseline from "${from}": the guard compares with the ${BASELINE_REF} tag. ` +
        'Pass --allow-other-ref to experiment; the parity test rejects such a baseline.',
    );
  }
  const sha = requireCommit(from);
  const sources = readSourcesAtRef(from);
  if (sources.length === 0) throw new Error(`No sources found under src/ at "${from}"`);
  const { ids } = analyseSources(sources);
  writeJson(write, { source: { ref: from, sha }, ...ids });
  say(
    `${write}: ${ids.testIDs.length} testIDs, ${ids.accessibilityLabels.length} accessibility ` +
      `labels from ${sources.length} files at ${from} (${sha})`,
  );
  return 0;
}

/** Problems with the baseline's link to its tag; a tag that is not here is only noted. */
function tagProblems(source) {
  const sha = commitOf(source.ref);
  if (!sha) {
    complain(
      `Note: "${source.ref}" is not in this clone, so its commit is not verified (git fetch --tags).`,
    );
    return [];
  }
  return sha === source.sha
    ? []
    : [
        `"${source.ref}" now points at ${sha}, but the baseline was taken from ${source.sha}.`,
      ];
}

function checkBaseline(options) {
  const baseline = readJson(options.check);
  const shape = validateBaseline(baseline);
  if (shape.length > 0) {
    complain(`${options.check} is invalid:\n${shape.map((p) => `  - ${p}`).join('\n')}`);
    return 1;
  }
  const allowlistFile = options.allowlist ?? defaults.allowlist;
  const analysis = analyseSources(readWorkingTreeSources(appRoot));
  const extended = withTabIds(baseline, analysis.ids, discoverTabRoutes(appRoot));
  const allowlist = readJson(allowlistFile);
  const allowlistProblems = validateAllowlist(
    allowlist,
    extended.baseline,
    extended.current,
  );

  const reports = [
    tagProblems(baseline.source).join('\n'),
    allowlistProblems.length > 0
      ? `Allowlist ${allowlistFile} is invalid:\n${allowlistProblems.map((p) => `  - ${p}`).join('\n')}`
      : formatMissing(findMissing(extended.baseline, extended.current, allowlist)),
    formatUnresolvedSelectors(
      findUnresolvedSelectors(readMaestroSelectors(appRoot), analysis.ids.testIDs),
    ),
    compareUnresolved(
      readJson(options['unresolved-count'] ?? defaults.unresolvedCount),
      analysis.unresolved,
    ),
  ].filter(Boolean);
  if (reports.length > 0) {
    complain(reports.join('\n\n'));
    return 1;
  }
  say(
    `Parity holds: ${baseline.testIDs.length} testIDs and ${baseline.accessibilityLabels.length} ` +
      'accessibility labels, the concrete tab ids and every Maestro selector are still served.',
  );
  return 0;
}

function writeUnresolved({ 'write-unresolved': file }) {
  const { unresolved } = analyseSources(readWorkingTreeSources(appRoot));
  for (const [title, occurrences] of Object.entries(unresolved)) {
    say(`${title} (${occurrences.length}):`);
    for (const o of occurrences) say(`  ${o.path}:${o.line} ${o.name}={${o.text}}`);
  }
  writeJson(file, {
    testIDs: unresolved.testIDs.length,
    accessibilityLabels: unresolved.accessibilityLabels.length,
  });
  say(`Wrote ${file}`);
  return 0;
}

function main(argv) {
  const options = parseOptions(argv);
  const modes = ['write-unresolved', 'check', 'from'].filter((mode) => options[mode]);
  if (modes.length !== 1) {
    throw new Error(
      'Choose one of --from <ref> --write <file>, --check <file> or --write-unresolved <file>',
    );
  }
  if (modes[0] === 'write-unresolved') return writeUnresolved(options);
  if (modes[0] === 'check') return checkBaseline(options);
  if (!options.write) throw new Error('--from needs --write <file>');
  return writeBaseline(options);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  complain(`${error instanceof Error ? error.message : String(error)}\n\n${usage}`);
  process.exitCode = 2;
}
