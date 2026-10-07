#!/usr/bin/env node
/**
 * testID and accessible-name baseline (feature 004, T414; FR-037, SC-003).
 *
 *   node scripts/testid-baseline.mjs --from <git-ref> --write <file>
 *       Extract every testID and static accessibilityLabel from the sources at
 *       <git-ref> (read with `git ls-tree` and `git show`) and write them, sorted
 *       and de-duplicated, as { "testIDs": [...], "accessibilityLabels": [...] }.
 *
 *   node scripts/testid-baseline.mjs --check <file> [--allowlist <file>]
 *       Extract the same from the working tree and exit 1, printing what is
 *       missing, when <file> has an item the tree lacks. Extra items are fine.
 *       --allowlist defaults to test/testid-parity.allowlist.json.
 *
 * The extractor is `scripts/lib/extract-ids.js`, shared with
 * `test/testid-parity.test.ts`, which runs the same comparison under Jest.
 * Regenerating the committed baseline:
 *
 *   node scripts/testid-baseline.mjs --from pre-004-baseline --write test/fixtures/testid-baseline.json
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  extractFromSources,
  findMissing,
  formatMissing,
  isSourceFile,
  readWorkingTreeSources,
  validateAllowlist,
} = require('./lib/extract-ids.js');

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultAllowlist = path.join(appRoot, 'test', 'testid-parity.allowlist.json');
const usage = [
  'Usage:',
  '  node scripts/testid-baseline.mjs --from <git-ref> --write <file>',
  '  node scripts/testid-baseline.mjs --check <file> [--allowlist <file>]',
].join('\n');

const say = (text) => process.stdout.write(`${text}\n`);
const complain = (text) => process.stderr.write(`${text}\n`);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--from', '--write', '--check', '--allowlist'].includes(flag) || !value) {
      throw new Error(`Unexpected argument: ${[flag, value].filter(Boolean).join(' ')}`);
    }
    options[flag.slice(2)] = value;
  }
  return options;
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** The app's sources at a git ref, as { path: 'src/...', text }. */
function readSourcesAtRef(ref) {
  const repoRoot = git(['rev-parse', '--show-toplevel'], appRoot).trim();
  const appPrefix = path.relative(repoRoot, appRoot).split(path.sep).join('/');
  const listing = git(
    ['ls-tree', '-r', '--name-only', ref, `${appPrefix}/src`],
    repoRoot,
  );
  return listing
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((full) => ({ full, relative: full.slice(appPrefix.length + 1) }))
    .filter(({ relative }) => isSourceFile(relative))
    .map(({ full, relative }) => ({
      path: relative,
      text: git(['show', `${ref}:${full}`], repoRoot),
    }));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function writeBaseline({ from, write }) {
  const sources = readSourcesAtRef(from);
  if (sources.length === 0) throw new Error(`No sources found under src/ at "${from}"`);
  const baseline = extractFromSources(sources);
  fs.mkdirSync(path.dirname(path.resolve(write)), { recursive: true });
  fs.writeFileSync(path.resolve(write), `${JSON.stringify(baseline, null, 2)}\n`);
  say(
    `${write}: ${baseline.testIDs.length} testIDs, ` +
      `${baseline.accessibilityLabels.length} accessibility labels from ` +
      `${sources.length} files at ${from}`,
  );
  return 0;
}

function checkBaseline({ check, allowlist: allowlistFile = defaultAllowlist }) {
  const baseline = readJson(check);
  const allowlist = readJson(allowlistFile);
  const current = extractFromSources(readWorkingTreeSources(appRoot));

  const problems = validateAllowlist(allowlist, baseline, current);
  if (problems.length > 0) {
    complain(
      `Allowlist ${allowlistFile} is invalid:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    return 1;
  }
  const report = formatMissing(findMissing(baseline, current, allowlist));
  if (report) {
    complain(report);
    return 1;
  }
  say(
    `Parity holds: ${baseline.testIDs.length} testIDs and ` +
      `${baseline.accessibilityLabels.length} accessibility labels still present.`,
  );
  return 0;
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.from && options.write && !options.check) return writeBaseline(options);
  if (options.check && !options.from && !options.write) return checkBaseline(options);
  throw new Error('Choose either --from <ref> --write <file> or --check <file>');
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  complain(`${error instanceof Error ? error.message : String(error)}\n\n${usage}`);
  process.exitCode = 2;
}
