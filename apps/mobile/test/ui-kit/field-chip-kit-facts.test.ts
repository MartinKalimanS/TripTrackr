/**
 * T420 / T421 - what the `Field` and `Chip` adapters rely on from the REAL kit (research
 * D4-02 items 4, 6 and 9), read from the kit itself rather than assumed, so a kit upgrade
 * that changes one fails here with the reason.
 *
 * Input:
 * 1. Its minimum height is 12 spacing steps (48 dp), a `min-height` and not a fixed height.
 * 2. Its stylesheet draws the field border (`field-border`, `--border-width-field-width`),
 *    but its Android CLASSES set a transparent border until focus, which hides it: that is
 *    why `Field` asks for `android:border-field-border` again.
 * 3. A caller's class is merged AFTER the kit's by tailwind-merge, so ours replaces the
 *    transparent one (same variant, same property) and beats it in the cascade. While the
 *    field is invalid it would also replace the kit's `android:border-danger`, which is why
 *    `Field` leaves it out then.
 *
 * Chip:
 * 4. It sets NO height or minimum height of its own: its size is padding plus line height,
 *    so the touch-target floor is the adapter's.
 * 5. Its label's weight is a component class with `font-medium` applied, so a `font-semibold`
 *    utility from the adapter wins and a selected chip can be heavier.
 */
import fs from 'node:fs';
import path from 'node:path';

import type * as HeroUI from 'heroui-native';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));

const { chipClassNames, inputClassNames } =
  jest.requireActual<typeof HeroUI>('heroui-native');

const stylesDir = path.join(
  path.dirname(require.resolve('heroui-native/package.json')),
  'src',
  'styles',
  'components',
);
const css = (name: string) =>
  fs.readFileSync(path.join(stylesDir, `${name}.css`), 'utf8');
const tokens = (className: string) => className.split(/\s+/).filter(Boolean);

/** The declarations of one rule of a kit stylesheet. */
function rule(file: string, selector: string): string {
  const escaped = selector.replace(/[.\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css(file));
  if (!match) throw new Error(`no rule ${selector} in ${file}.css`);
  return match[1] ?? '';
}

const INPUT = { variant: 'primary', isInvalid: false, isDisabled: false } as const;

describe('the kit Input (research D4-02 items 4 and 6)', () => {
  test('has a MINIMUM height of 12 spacing steps (48 dp), not a fixed height', () => {
    const declarations = rule('input', '.input__input');
    expect(declarations).toMatch(/min-height:\s*calc\(var\(--spacing\)\s*\*\s*12\)/);
    expect(declarations).not.toMatch(/(?<!min-)height:/);
  });

  test('draws the field border from the field-border token at the field width', () => {
    const declarations = rule('input', '.input__input');
    expect(declarations).toMatch(/border-width:\s*var\(--border-width-field-width\)/);
    expect(declarations).toMatch(/border-color:\s*var\(--color-field-border\)/);
  });

  test('but its Android classes make that border transparent until focus', () => {
    const classes = tokens(inputClassNames.input(INPUT));
    expect(classes).toContain('android:border-transparent');
    expect(classes).toContain('android:focus:border-accent');
  });

  test('our Android border replaces the transparent one and keeps the focus border', () => {
    const classes = tokens(
      inputClassNames.input({ ...INPUT, className: 'android:border-field-border' }),
    );
    expect(classes).toContain('android:border-field-border');
    expect(classes).not.toContain('android:border-transparent');
    expect(classes).toContain('android:focus:border-accent');
    expect(classes[classes.length - 1]).toBe('android:border-field-border');
  });

  test('while invalid the kit sets a danger border, which our class would replace', () => {
    const invalid = tokens(inputClassNames.input({ ...INPUT, isInvalid: true }));
    expect(invalid).toContain('android:border-danger');

    const replaced = tokens(
      inputClassNames.input({
        ...INPUT,
        isInvalid: true,
        className: 'android:border-field-border',
      }),
    );
    expect(replaced).not.toContain('android:border-danger');
  });
});

describe('the kit Chip (research D4-02 item 4)', () => {
  test('sets no height or minimum height on its root or on any size', () => {
    const everything = [
      rule('chip', '.chip__root'),
      rule('chip', '.chip__root--size-sm'),
      rule('chip', '.chip__root--size-md'),
      rule('chip', '.chip__root--size-lg'),
    ].join('\n');
    expect(everything).not.toMatch(/(?:min-|max-)?height:/);
  });

  test('is sized by padding: 4 dp (md) above and below its line, clipped to its shape', () => {
    expect(rule('chip', '.chip__root--size-md')).toMatch(
      /padding-block:\s*calc\(var\(--spacing\)\s*\*\s*1\)/,
    );
    expect(rule('chip', '.chip__root')).toMatch(/overflow:\s*hidden/);
  });

  test('puts our classes after the kit classes, so a utility beats the label weight', () => {
    const root = tokens(
      chipClassNames.root({
        variant: 'tertiary',
        size: 'md',
        color: 'default',
        className: 'border border-border',
      }),
    );
    expect(root.slice(-2)).toEqual(['border', 'border-border']);

    const label = tokens(
      chipClassNames.label({
        variant: 'primary',
        size: 'md',
        color: 'accent',
        className: 'font-semibold',
      }),
    );
    expect(label[label.length - 1]).toBe('font-semibold');
    expect(rule('chip', '.chip__label')).toMatch(/font-weight|font-medium/);
  });

  test('tertiary is transparent and primary accent is filled, with the matching labels', () => {
    expect(rule('chip', '.chip__root--variant-tertiary')).toMatch(
      /background-color:\s*transparent/,
    );
    expect(rule('chip', '.chip__root--variant-primary--color-accent')).toMatch(
      /background-color:\s*var\(--color-accent\)/,
    );
    expect(rule('chip', '.chip__label--variant-primary--color-accent')).toMatch(
      /color:\s*var\(--color-accent-foreground\)/,
    );
    expect(rule('chip', '.chip__label--variant-tertiary--color-default')).toMatch(
      /color:\s*var\(--color-default-soft-foreground\)/,
    );
  });
});
