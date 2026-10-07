/**
 * @jest-environment node
 *
 * T412 — the npm entry points of the theme generator (contract C4-5).
 *
 * `src/theme/generated/theme.css` is written by `scripts/build-theme-css.mjs`. The
 * generated file and the script's own messages tell a contributor which command to run,
 * so those words must name scripts that exist.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MOBILE_ROOT = path.resolve(__dirname, '..', '..');
const read = (...segments: string[]) =>
  readFileSync(path.join(MOBILE_ROOT, ...segments), 'utf8').replace(/\r\n/g, '\n');

const { scripts } = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>;
};

describe('apps/mobile package scripts for the theme generator', () => {
  test('theme:build regenerates the stylesheet', () => {
    expect(scripts['theme:build']).toBe('node scripts/build-theme-css.mjs');
  });

  test('theme:check fails when the committed stylesheet is stale', () => {
    expect(scripts['theme:check']).toBe('node scripts/build-theme-css.mjs --check');
  });

  test('the generated file names the npm script that regenerates it', () => {
    const header = read('src', 'theme', 'generated', 'theme.css').split('*/')[0];
    expect(header).toContain('npm run theme:build -w apps/mobile');
  });

  test('the generator names the same scripts in its own messages', () => {
    const generator = read('scripts', 'build-theme-css.mjs');
    expect(generator).toContain('npm run theme:build -w apps/mobile');
    expect(generator).toContain('npm run theme:check -w apps/mobile');
    expect(generator).not.toContain('A later change adds the `theme:build` npm script');
  });
});
