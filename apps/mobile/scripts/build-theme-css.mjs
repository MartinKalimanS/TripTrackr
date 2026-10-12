#!/usr/bin/env node
/**
 * Writes `src/theme/generated/theme.css` from the palette (feature 004, contract C4-5; the
 * Sunrise variable map of feature 005, contract C5-6).
 *
 *   npm run theme:build -w apps/mobile    (repository root) regenerate the file
 *   npm run theme:check -w apps/mobile    exit 1 when the committed file is stale
 *
 * They are scripts in apps/mobile/package.json that run this file as
 * `node scripts/build-theme-css.mjs` and `node scripts/build-theme-css.mjs --check`.
 *
 * The file is a pure function of `src/theme/palette.data.js` and the variable map in
 * `scripts/theme-css.js`; `test/theme/theme-css-sync.test.ts` regenerates it in memory
 * and fails the build when the committed copy differs, so a retuned colour can never
 * ship half-applied.
 *
 * Plain Node ESM: no dependency, no TypeScript step. That is why the palette is authored
 * as plain data (`palette.data.js`) rather than only in `palette.ts`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import palettes from '../src/theme/palette.data.js';
import { buildThemeCss } from './theme-css.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(here, '../src/theme/generated/theme.css');

function readCommitted() {
  try {
    // The repository stores LF; a Windows checkout may hold CRLF.
    return readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function main(args) {
  const css = buildThemeCss(palettes);

  if (args.includes('--check')) {
    if (readCommitted() === css) {
      process.stdout.write('theme.css is up to date.\n');
      return 0;
    }
    process.stderr.write(
      'theme.css is stale. Run: node scripts/build-theme-css.mjs (from apps/mobile)\n',
    );
    return 1;
  }

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, css, 'utf8');
  process.stdout.write(`Wrote ${OUTPUT}\n`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`build-theme-css failed: ${error.message}\n`);
  process.exitCode = 1;
}
