// The dependency-audit gate (step S-01; docs/roadmap/CICD-AND-RELEASE.md section 2.1).
//
// `npm audit --audit-level=high` fails the build on any advisory, including one with no fix that
// the project cannot act on, and it has no allowlist. This gate runs the same audit and fails on
// the same advisories EXCEPT those named in `security/audit-allowlist.json`, each with a reason
// and an expiry date: an entry past its date fails the gate again, so a waiver is never forever.
//
//   node scripts/audit-gate.mjs            audits the production dependencies (`--omit=dev`)
//   node scripts/audit-gate.mjs --file f   reads a saved `npm audit --json` instead (tests)
//
// Exit 0: nothing high or critical outside the allowlist. Exit 1: findings, or an expired entry.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BLOCKING = new Set(['high', 'critical']);
const ALLOWLIST = new URL('../security/audit-allowlist.json', import.meta.url);

/** The advisory id of a `via` entry: the GHSA of its URL, else its numeric source. */
function adviceId(via) {
  const ghsa = /GHSA-[a-z0-9-]+/i.exec(via.url ?? '');
  return ghsa ? ghsa[0].toUpperCase() : String(via.source ?? via.title ?? 'unknown');
}

/** Every high or critical advisory in an `npm audit --json` report, once each. */
export function blockingAdvisories(report) {
  const found = new Map();
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via === 'string' || !BLOCKING.has(via.severity)) continue;
      const id = adviceId(via);
      const previous = found.get(id);
      found.set(id, {
        id,
        severity: via.severity,
        title: via.title ?? '',
        packages: [...new Set([...(previous?.packages ?? []), name])],
      });
    }
  }
  return [...found.values()];
}

/**
 * The verdict: the advisories nobody waived, and the waivers that expired or are malformed.
 * `now` is a Date, so a test can move the clock.
 */
export function evaluateAudit(report, allowlist, now = new Date()) {
  const waived = new Map();
  const problems = [];
  for (const entry of allowlist.entries ?? []) {
    const expires = new Date(`${entry.expires}T23:59:59Z`);
    if (!entry.id || !entry.reason || Number.isNaN(expires.getTime())) {
      problems.push(`malformed allowlist entry: ${JSON.stringify(entry)}`);
    } else if (expires < now) {
      problems.push(
        `${entry.id}: the waiver expired on ${entry.expires} (${entry.reason})`,
      );
    } else {
      waived.set(entry.id.toUpperCase(), entry);
    }
  }
  const unwaived = blockingAdvisories(report).filter(
    (advisory) => !waived.has(advisory.id.toUpperCase()),
  );
  return { unwaived, problems, ok: unwaived.length === 0 && problems.length === 0 };
}

function runAudit() {
  try {
    return execSync('npm audit --omit=dev --json', {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    // `npm audit` exits 1 when it finds anything: the report is still on stdout.
    if (typeof error.stdout === 'string' && error.stdout.trim() !== '')
      return error.stdout;
    throw error;
  }
}

function main() {
  const fileAt = process.argv.indexOf('--file');
  const raw = fileAt > -1 ? readFileSync(process.argv[fileAt + 1], 'utf8') : runAudit();
  const report = JSON.parse(raw);
  const allowlist = JSON.parse(readFileSync(ALLOWLIST, 'utf8'));
  const verdict = evaluateAudit(report, allowlist);
  for (const advisory of verdict.unwaived) {
    console.error(
      `${advisory.severity.toUpperCase()} ${advisory.id} in ${advisory.packages.join(', ')}: ${advisory.title}`,
    );
  }
  for (const problem of verdict.problems) console.error(`ALLOWLIST ${problem}`);
  if (verdict.ok)
    console.log('audit gate: no high or critical advisory outside the allowlist');
  process.exitCode = verdict.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
