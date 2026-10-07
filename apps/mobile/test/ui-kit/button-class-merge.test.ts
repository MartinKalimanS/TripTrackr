/**
 * T417 - what the `Button` adapter relies on from the REAL kit (research D4-02, items 4
 * and 6), read from the kit itself rather than assumed:
 *
 * 1. The kit gives Button a FIXED height per size (sm 40, md 48, lg 56 dp), declared in
 *    its stylesheet, not as a utility class.
 * 2. A caller's `className` is appended AFTER the kit's own classes (`tv` from
 *    tailwind-variants, merged with tailwind-merge), and tailwind-merge does not drop a
 *    utility because a component class sits beside it.
 * 3. Uniwind resolves two classes that set the same property by their ORDER when they are
 *    equally specific (`resolveStyles` in `uniwind/src/core/native/store.ts`: a later
 *    class replaces an earlier one unless the earlier is more complex or `!important`).
 *
 * Together they mean `h-auto` and `min-h-*`-style overrides beat the fixed height, which
 * is what lets a label wrap at the largest text size. The first fact is read from the
 * stylesheet; the second is computed by the kit's own class builder (exported as
 * `buttonClassNames`), under the same Reanimated doubles `real-render.test.tsx` uses.
 */
import fs from 'node:fs';
import path from 'node:path';

import type * as HeroUI from 'heroui-native';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));

const { buttonClassNames } = jest.requireActual<typeof HeroUI>('heroui-native');

const kitSource = path.join(
  path.dirname(require.resolve('heroui-native/package.json')),
  'src',
);
const buttonCss = fs.readFileSync(
  path.join(kitSource, 'styles', 'components', 'button.css'),
  'utf8',
);

/** The `height` declared for a size class, as a count of the 4 dp spacing step. */
function kitHeightSteps(size: 'sm' | 'md' | 'lg'): number {
  const rule = new RegExp(
    String.raw`\.button__root--size-${size}\s*\{[^}]*?\bheight:\s*calc\(var\(--spacing\)\s*\*\s*(\d+)\)`,
  );
  const match = rule.exec(buttonCss);
  if (!match) throw new Error(`no fixed height found for size ${size}`);
  return Number(match[1]);
}

describe('the kit Button height (research D4-02 item 4)', () => {
  test.each([
    ['sm', 40],
    ['md', 48],
    ['lg', 56],
  ] as const)('%s is a fixed %i dp (spacing step x4)', (size, dp) => {
    expect(kitHeightSteps(size) * 4).toBe(dp);
  });

  test('icon-only is square by aspect ratio, with no padding', () => {
    expect(buttonCss).toMatch(
      /\.button__root--is-icon-only\s*\{[^}]*padding:\s*0;[^}]*aspect-ratio:\s*1;/,
    );
  });
});

describe('a caller className on the kit Button (research D4-02 item 6)', () => {
  const OURS = 'h-auto py-2 active:bg-surface-tertiary';
  const tokens = (className: string) => className.split(/\s+/).filter(Boolean);

  test('keeps the kit size class and puts ours after it, so ours wins the cascade', () => {
    const merged = tokens(
      buttonClassNames.root({
        variant: 'ghost',
        size: 'md',
        isIconOnly: false,
        isDisabled: false,
        className: OURS,
      }),
    );
    expect(merged).toEqual(
      expect.arrayContaining(['button__root--size-md', ...tokens(OURS)]),
    );
    expect(merged.indexOf('h-auto')).toBeGreaterThan(
      merged.indexOf('button__root--size-md'),
    );
    expect(merged.slice(-3)).toEqual(tokens(OURS));
  });

  test('the label keeps `shrink` and `text-center` after the kit label classes', () => {
    const merged = tokens(
      buttonClassNames.label({
        size: 'md',
        variant: 'ghost',
        className: 'shrink text-center',
      }),
    );
    expect(merged.slice(-2)).toEqual(['shrink', 'text-center']);
    expect(merged).toContain('button__label--size-md');
  });
});
