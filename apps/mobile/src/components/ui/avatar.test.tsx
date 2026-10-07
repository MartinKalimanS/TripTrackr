/**
 * T423 - contract C4-8 (`Avatar`), FR-030.
 *
 * The kit's Avatar is a plain View with a fallback child under Jest
 * (test/mocks/heroui-native.tsx), so what is asserted is the initials the adapter
 * derives, what it asks of the kit, and the accessibility contract on the root.
 */
import { render, screen } from '@testing-library/react-native';

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

  test('a name made of marks or digits still gives a glyph', () => {
    expect(initialsOf('3M Corp')).toBe('3C');
    expect(initialsOf('(Ada)')).toBe('(');
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
