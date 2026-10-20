/**
 * T412 / T404 — the `uniwind` stand-in in `jest.setup.ts` answers `useCSSVariable` like the
 * app would on a device, not for every name.
 *
 * The real hook returns `undefined` for a variable that no stylesheet defines. A stand-in
 * that answered a placeholder for ANY name would let a typo (`--surfce`) or a variable
 * dropped from the theme pass every component test and show up as a missing colour on a
 * phone. So it answers a placeholder only for the names the app's own stylesheets declare,
 * `src/theme/generated/theme.css` and `src/global.css` (the six type-face variables), and
 * `undefined` for the rest.
 */
import { renderHook } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useCSSVariable } from 'uniwind';

const SRC = path.resolve(__dirname, '..', '..', 'src');

/** Every `--name:` a stylesheet declares, comments left out. */
function declaredIn(file: string): Set<string> {
  const css = readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
}

const generated = declaredIn(path.join('theme', 'generated', 'theme.css'));
const global = declaredIn('global.css');

const read = async (name: string | string[]) =>
  (await renderHook(() => useCSSVariable(name as string))).result.current as unknown;

describe('useCSSVariable under Jest', () => {
  test('the stylesheets declare what these tests assume they do', () => {
    for (const name of [
      '--background',
      '--accent',
      '--field-border-width',
      '--status-active',
      '--pending',
    ]) {
      expect(generated.has(name)).toBe(true);
    }
    expect([...global].sort()).toEqual([
      '--font-body',
      '--font-body-bold',
      '--font-body-semibold',
      '--font-display',
      '--font-display-bold',
      '--font-serif',
    ]);
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

  test.each([
    '--font-display',
    '--font-display-bold',
    '--font-body',
    '--font-body-semibold',
    '--font-body-bold',
    '--font-serif',
  ])('answers for %s, which global.css declares for a type face', async (name) => {
    // The generated theme does not declare it: the name comes from scanning global.css.
    expect(generated.has(name)).toBe(false);
    expect(await read(name)).toEqual(expect.any(String));
  });

  test('answers for every name either stylesheet declares, array or single', async () => {
    const names = [...generated, ...global];
    expect(await read(names)).toEqual(names.map(() => expect.any(String)));
  });

  // `--color-accent-soft` is the KIT's derived colour (heroui-native/styles): it is in no
  // app stylesheet, so an adapter that needs its value in JS must ask for a palette token.
  // `--font-normal` is the kit's family variable, which global.css deliberately leaves alone.
  test.each([
    '--surfce',
    '--no-such-variable',
    '--color-accent-soft',
    '--font-normal',
    'background',
  ])('answers undefined for %s, which no app stylesheet declares', async (name) => {
    expect(await read(name)).toBeUndefined();
  });

  test('answers per name for an array, undefined where there is no such variable', async () => {
    expect(await read(['--accent', '--surfce', '--font-display'])).toEqual([
      expect.stringMatching(/^#/),
      undefined,
      expect.any(String),
    ]);
  });
});
