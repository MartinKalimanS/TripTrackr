/**
 * T520 - contract C5-16 (`PrivacyChip`), FR-055, FR-065, FR-070; the private line of the
 * trip screen. A lock icon on `aquaTint` in `aquaInk`, announced "Only you can see this",
 * id `privacy-chip`. Nothing here stores or sends anything: it is a label.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PaletteNames, Palettes } from '@/theme';

import { glyphsIn } from '../../../test/helpers/icons';
import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { PrivacyChip } from './privacy-chip';

afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;
const classesOf = (element: { props: { className?: unknown } }) =>
  String(element.props.className ?? '').split(/\s+/);

describe('<PrivacyChip> identity', () => {
  test('says "Only you" and is announced "Only you can see this", one text element', async () => {
    await render(<PrivacyChip />);
    const node = screen.getByTestId('privacy-chip');
    expect(screen.getByText('Only you')).toBeTruthy();
    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityRole).toBe('text');
    expect(node.props.accessibilityLabel).toBe('Only you can see this');
    expect(screen.getByLabelText('Only you can see this')).toBe(node);
  });

  test('draws the lock, decorative: the words carry the meaning', async () => {
    await render(<PrivacyChip />);
    expect(glyphsIn().map((glyph) => glyph.name)).toEqual(['lock']);
    expect(screen.getByTestId('privacy-chip-icon', hidden).props.accessible).toBe(false);
  });

  test('is not pressable: it is a label', async () => {
    await render(<PrivacyChip />);
    expect(screen.getByTestId('privacy-chip').props.onPress).toBeUndefined();
  });

  test('takes the one label of the contract and refuses any other, at compile time', () => {
    const ok = <PrivacyChip label="Only you" />;
    // @ts-expect-error - the contract has one label
    const other = <PrivacyChip label="Everyone" />;
    expect([ok, other]).toHaveLength(2);
  });
});

describe.each(PaletteNames)('<PrivacyChip> look in %s - C5-16', (theme) => {
  const palette = Palettes[theme];
  beforeEach(() => mockThemeColors(theme));

  test('is aquaTint with aquaInk words and an aquaInk lock', async () => {
    await render(<PrivacyChip />);
    expect(flat(screen.getByTestId('privacy-chip')).backgroundColor).toBe(
      asCss(palette.aquaTint),
    );
    expect(classesOf(screen.getByText('Only you'))).toContain('text-aqua-ink');
    expect(glyphsIn()[0]?.color).toBe(asCss(palette.aquaInk));
  });
});

describe('<PrivacyChip> layout - FR-029', () => {
  test('hugs its content as a capsule, with no fixed height, and its words are capped at 1.3', async () => {
    await render(<PrivacyChip />);
    const node = screen.getByTestId('privacy-chip');
    expect(flat(node)).toMatchObject({ flexDirection: 'row', alignSelf: 'flex-start' });
    expect(flat(node).height).toBeUndefined();
    expect(screen.getByText('Only you').props.maxFontSizeMultiplier).toBe(1.3);
  });
});
