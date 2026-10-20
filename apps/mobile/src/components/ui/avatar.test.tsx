/**
 * T423 - contract C4-8 (`Avatar`), FR-030.
 *
 * The kit's Avatar is a plain View with a fallback child under Jest
 * (test/mocks/heroui-native.tsx), so what is asserted is the initials the adapter
 * derives, what it asks of the kit, and the accessibility contract on the root.
 */
import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';

import { Avatar, initialsOf } from './avatar';

describe('initialsOf - the first letters of up to two words', () => {
  test.each([
    ['Ada Lovelace', 'AL'],
    ['Martin Ortega', 'MO'],
    ['ada lovelace', 'AL'],
    ['Ada Augusta King', 'AA'],
    ['Jean-Luc Picard', 'JP'],
    ['Ana Maria de la Cruz', 'AM'],
  ])('%s -> %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });

  test.each([
    ['Ada', 'A'],
    ['ada', 'A'],
    ['x', 'X'],
  ])('a single word gives one letter: %s -> %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });

  test.each([
    ['  Ada   Lovelace  ', 'AL'],
    ['\tAda\n\nLovelace ', 'AL'],
    ['\u00a0Ada\u00a0Lovelace', 'AL'],
  ])('extra and unusual whitespace is ignored: %j -> %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });

  test.each([[''], ['   '], ['\n\t']])(
    'an empty name gives a question mark: %j',
    (name) => {
      expect(initialsOf(name)).toBe('?');
    },
  );

  test('an emoji is one initial, not half of a surrogate pair', () => {
    expect(initialsOf('😀 Party')).toBe('😀P');
    expect(initialsOf('😀')).toBe('😀');
    expect(initialsOf('Sam 🚀')).toBe('S🚀');
    expect(initialsOf('😀')).toHaveLength(2);
  });

  test('an emoji keeps its variation selector', () => {
    expect(initialsOf('\u2764\uFE0F Heart')).toBe('\u2764\uFE0FH');
  });

  test('a flag is one initial', () => {
    expect(initialsOf('🇵🇹 Portugal')).toBe('🇵🇹P');
  });

  test('a letter keeps its accent and is upper-cased', () => {
    expect(initialsOf('élodie dupont')).toBe('ÉD');
    expect(initialsOf('e\u0301lodie')).toBe('E\u0301');
  });

  test('a digit is an initial', () => {
    expect(initialsOf('3M Corp')).toBe('3C');
  });
});

/** Code points written out, so no editor or font can change what a case means. */
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}';
const RAINBOW_FLAG = '\u{1F3F3}\uFE0F\u200D\u{1F308}';
const WOMAN_ASTRONAUT_TONE = '\u{1F469}\u{1F3FD}\u200D\u{1F680}';
const THUMBS_UP_TONE = '\u{1F44D}\u{1F3FD}';
const PORTUGAL = '\u{1F1F5}\u{1F1F9}';
const ENGLAND = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
const KEYCAP_ONE = '1\uFE0F\u20E3';

describe('initialsOf - one grapheme per initial', () => {
  test.each([
    ['a ZWJ family', `${FAMILY} Smith`, `${FAMILY}S`],
    ['a ZWJ flag', `${RAINBOW_FLAG} Pride`, `${RAINBOW_FLAG}P`],
    [
      'a ZWJ sequence with a skin tone',
      `${WOMAN_ASTRONAUT_TONE} Ada`,
      `${WOMAN_ASTRONAUT_TONE}A`,
    ],
    ['a skin-tone modifier', `${THUMBS_UP_TONE} Ada`, `${THUMBS_UP_TONE}A`],
    ['a regional-indicator flag', `${PORTUGAL} Portugal`, `${PORTUGAL}P`],
    ['a subdivision flag (tag sequence)', `${ENGLAND} Ada`, `${ENGLAND}A`],
    ['a keycap', `${KEYCAP_ONE} Place`, `${KEYCAP_ONE}P`],
    ['a keycap without the variation selector', '1\u20E3 Place', '1\u20E3P'],
  ])('%s is one initial', (_label, name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });

  test('a flag is not split: three indicators give the first pair only', () => {
    expect(initialsOf(`${PORTUGAL}\u{1F1E7} x`)).toBe(`${PORTUGAL}X`);
  });

  test('a lone ZWJ sequence name gives that one glyph', () => {
    expect(initialsOf(FAMILY)).toBe(FAMILY);
    expect(initialsOf(RAINBOW_FLAG)).toBe(RAINBOW_FLAG);
  });

  test.each([
    [
      'Devanagari: a consonant with its vowel sign',
      '\u0915\u093F\u0930\u0923',
      '\u0915\u093F',
    ],
    [
      'Thai: a consonant with its vowel mark',
      '\u0E01\u0E34\u0E15\u0E15\u0E34',
      '\u0E01\u0E34',
    ],
    [
      'Arabic: a letter with its harakat',
      '\u0645\u064F\u062D\u064E\u0645\u0651\u062F',
      '\u0645\u064F',
    ],
    [
      'Hebrew: a letter with its niqqud',
      '\u05D3\u05B8\u05BC\u05D5\u05B4\u05D3',
      '\u05D3\u05B8\u05BC',
    ],
    ['Latin with a combining accent', 'e\u0301lodie', 'E\u0301'],
  ])('%s stays together', (_label, name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });

  test('two non-Latin words give one grapheme each', () => {
    expect(initialsOf('\u0915\u093F\u0930\u0923 \u0936\u0930\u094D\u092E\u093E')).toBe(
      '\u0915\u093F\u0936',
    );
  });
});

describe('initialsOf - the first letter, number or pictograph of a word', () => {
  test.each([
    ['(Ada) Lovelace', 'AL'],
    ['"Ada" "Lovelace"', 'AL'],
    ['\u201CAda\u201D \u2018Lovelace\u2019', 'AL'],
    ['@ada _lovelace', 'AL'],
    ['\u2014Ada', 'A'],
    ['[Ada]', 'A'],
    ['#1 Fan', '1F'],
    ['(\u{1F600}) Party', '\u{1F600}P'],
    ['\u00A1Ol\u00E9! \u00BFQu\u00E9?', 'OQ'],
  ])('%s -> %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });

  test('a word with no letter, number or pictograph is not a word', () => {
    expect(initialsOf('Ada & Bob')).toBe('AB');
    expect(initialsOf('Ada - Bob')).toBe('AB');
    expect(initialsOf('& Ada')).toBe('A');
  });

  test.each([['...'], ['-'], ['( )'], ['\u2014 \u2013'], ['!?']])(
    'a name of punctuation alone gives a question mark: %j',
    (name) => {
      expect(initialsOf(name)).toBe('?');
    },
  );
});

describe('initialsOf - capitalisation keeps one code point', () => {
  test('a sharp s is S, not SS', () => {
    expect(initialsOf('\u00DFmith')).toBe('S');
    expect(initialsOf('Stra\u00DFe \u00DFmith')).toBe('SS');
    expect(initialsOf('\u00DF')).toHaveLength(1);
  });

  test('a ligature gives its first letter only', () => {
    expect(initialsOf('\uFB01nn')).toBe('F');
  });

  test('a digraph capital is one code point', () => {
    expect(initialsOf('\u01C6ula')).toBe('\u01C4');
  });

  test('the accent that follows the capital is kept', () => {
    expect(initialsOf('\u00E9lodie')).toBe('\u00C9');
    expect(initialsOf('e\u0301lodie dupont')).toBe('E\u0301D');
  });

  test('a capital stays a capital', () => {
    expect(initialsOf('ADA LOVELACE')).toBe('AL');
  });
});

describe('the grapheme matcher is Hermes-safe', () => {
  // Hermes compiles a regular expression when the bundle is built, and supports
  // \p{...} under the u flag, but not look-behind. The matcher was also compiled with
  // hermesc (node_modules/hermes-compiler) when it was written: an unsupported
  // property name is a compile error there. This guards what a unit test can: that no
  // look-behind or named group creeps into the file.
  const source = fs.readFileSync(path.resolve(__dirname, 'avatar.tsx'), 'utf8');

  test('uses no look-behind', () => {
    expect(source).not.toMatch(/\(\?<[=!]/);
  });

  test('every regular expression literal in it carries the u flag', () => {
    const literals = source.match(/\/\^?\(\?:[^\n]*\/[a-z]*;/g) ?? [];
    expect(literals.length).toBeGreaterThan(0);
    for (const literal of literals) {
      expect(literal.slice(literal.lastIndexOf('/') + 1)).toContain('u');
    }
  });
});

describe('<Avatar>', () => {
  test('shows the initials in the kit fallback', async () => {
    await render(<Avatar name="Ada Lovelace" testID="avatar" />);
    expect(screen.getByText('AL')).toBeTruthy();
  });

  test('shows a question mark for an empty name', async () => {
    await render(<Avatar name="  " testID="avatar" />);
    // Hidden from assistive technology (nothing to announce), so the query must say so.
    expect(screen.getByText('?', { includeHiddenElements: true })).toBeTruthy();
  });

  test('is md unless asked, and passes sm, md and lg to the kit', async () => {
    await render(<Avatar name="Ada" testID="avatar" />);
    expect(screen.getByTestId('avatar').props.size).toBe('md');
    for (const size of ['sm', 'md', 'lg'] as const) {
      await render(<Avatar name="Ada" size={size} testID={size} />);
      expect(screen.getByTestId(size).props.size).toBe(size);
    }
  });

  test('uses the solid default fill, never a soft one (review rule 5)', async () => {
    await render(<Avatar name="Ada" testID="avatar" />);
    const props = screen.getByTestId('avatar').props;
    expect(props.variant).toBe('default');
    expect(props.color).toBe('default');
  });

  test('forwards testID to the root node', async () => {
    await render(<Avatar name="Ada" testID="trip-owner" />);
    expect(screen.getByTestId('trip-owner')).toBeTruthy();
  });
});

describe('<Avatar> accessibility - contract C4-8, FR-030', () => {
  test('is an image named after the person', async () => {
    await render(<Avatar name="Ada Lovelace" testID="avatar" />);
    const node = screen.getByTestId('avatar');
    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityRole).toBe('image');
    expect(node.props.accessibilityLabel).toBe('Ada Lovelace');
    expect(screen.getByLabelText('Ada Lovelace')).toBeTruthy();
  });

  test('names itself with the trimmed name, not the initials', async () => {
    await render(<Avatar name="  Ada   Lovelace " testID="avatar" />);
    expect(screen.getByTestId('avatar').props.accessibilityLabel).toBe('Ada Lovelace');
  });

  test('decorative hides it from assistive technology', async () => {
    await render(<Avatar name="Ada Lovelace" decorative testID="avatar" />);
    const node = screen.getByTestId('avatar', { includeHiddenElements: true });
    expect(node.props.accessible).toBe(false);
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(node.props.accessibilityLabel).toBeUndefined();
    expect(screen.queryByLabelText('Ada Lovelace')).toBeNull();
  });

  test('an empty name has nothing to announce, so it is hidden too', async () => {
    await render(<Avatar name="" testID="avatar" />);
    const node = screen.getByTestId('avatar', { includeHiddenElements: true });
    expect(node.props.accessible).toBe(false);
    expect(node.props.accessibilityLabel).toBeUndefined();
  });
});
