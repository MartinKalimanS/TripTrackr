/**
 * T412 / T404 — the `uniwind` stand-in in `jest.setup.ts` answers `useCSSVariable` like the
 * app would on a device, not for every name.
 *
 * The real hook returns `undefined` for a variable that no stylesheet defines. A stand-in
 * that answered a placeholder for ANY name would let a typo (`--surfce`) or a variable
 * dropped from the theme pass every component test and show up as a missing colour on a
 * phone. So it answers a placeholder only for the names `src/theme/generated/theme.css`
 * declares, and `undefined` for the rest.
 */
import { renderHook } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useCSSVariable } from 'uniwind';

const generated = readFileSync(
  path.resolve(__dirname, '..', '..', 'src', 'theme', 'generated', 'theme.css'),
  'utf8',
);
const declared = new Set(
  [...generated.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:/g)].map(
    (match) => match[1],
  ),
);

const read = async (name: string | string[]) =>
  (await renderHook(() => useCSSVariable(name as string))).result.current as unknown;

describe('useCSSVariable under Jest', () => {
  test('the generated file declares what these tests assume it does', () => {
    for (const name of [
      '--background',
      '--accent',
      '--field-border-width',
      '--status-active',
      '--pending',
    ]) {
      expect(declared.has(name)).toBe(true);
    }
  });

  test.each(['--background', '--accent', '--surface-shadow', '--status-planning-ink'])(
    'answers a placeholder colour for %s, which the generated theme declares',
    async (name) => {
      expect(await read(name)).toEqual(expect.stringMatching(/^#[0-9a-f]{6}$/i));
    },
  );

  test('answers a placeholder for a shared variable and for a Tailwind colour it exposes', async () => {
    expect(await read('--field-border-width')).toBeDefined();
    expect(await read('--color-status-active')).toBeDefined();
  });

  // `--color-accent-soft` is the KIT's derived colour (heroui-native/styles): it is in no
  // generated theme, so an adapter that needs its value in JS must ask for a palette token.
  test.each(['--surfce', '--no-such-variable', '--color-accent-soft', 'background'])(
    'answers undefined for %s, which the generated theme does not declare',
    async (name) => {
      expect(await read(name)).toBeUndefined();
    },
  );

  test('answers per name for an array, undefined where the theme has no such variable', async () => {
    expect(await read(['--accent', '--surfce', '--pending'])).toEqual([
      expect.stringMatching(/^#/),
      undefined,
      expect.stringMatching(/^#/),
    ]);
  });
});
