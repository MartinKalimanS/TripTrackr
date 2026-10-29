/**
 * Writes `src/config/open-source-licenses.json`: the name, version and licence of every direct
 * dependency of the app (spec 010; FR-005). `--check` fails when the file is stale, as
 * `theme:build --check` does. Dependencies resolve from the hoisted root `node_modules`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'src/config/open-source-licenses.json');
const require = createRequire(join(root, 'package.json'));

function licenceOf(meta) {
  if (typeof meta.license === 'string') return meta.license;
  if (meta.license && typeof meta.license.type === 'string') return meta.license.type;
  if (Array.isArray(meta.licenses)) return meta.licenses.map((l) => l.type).join(' OR ');
  return 'UNKNOWN';
}

function readMeta(name) {
  let dir = dirname(require.resolve(name, { paths: [root] }));
  for (let i = 0; i < 6; i += 1) {
    try {
      const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (meta.name === name) return meta;
    } catch {
      // keep walking up
    }
    dir = dirname(dir);
  }
  return null;
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const entries = Object.keys(pkg.dependencies ?? {})
  .filter((name) => !name.startsWith('@triptrackr/'))
  .sort()
  .map((name) => {
    const meta = readMeta(name);
    return {
      name,
      version: meta?.version ?? 'unknown',
      license: meta ? licenceOf(meta) : 'UNKNOWN',
    };
  });
const text = `${JSON.stringify(entries, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8');
  } catch {
    // missing counts as stale
  }
  if (current !== text) {
    process.stderr.write('open-source-licenses.json is stale: run npm run licenses\n');
    process.exit(1);
  }
} else {
  writeFileSync(out, text);
}
