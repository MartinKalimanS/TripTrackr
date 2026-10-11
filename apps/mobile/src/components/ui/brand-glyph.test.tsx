/**
 * `BrandGlyph` - feature 004, T446 (FR-024, FR-030; research D4-08: "Ionicons stay only for
 * the Google and Apple brand glyphs").
 *
 * The glyph itself is Ionicons' (stood in below, so which logo and which ink are the
 * subject); what the adapter owns is the ink, which follows the active theme through the kit
 * and cannot be chosen by a caller, and that the glyph is decorative: the control it sits in
 * is named by its own label.
 */
import { render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { StyleSheet } from 'react-native';

import { BrandGlyph } from './brand-glyph';

// The glyph font is not the subject; which logo, which size, in which colour, is.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = jest.requireActual('react-native');
  return function MockIonicons({
    name,
    color,
    size,
  }: {
    name: string;
    color: string;
    size: number;
  }) {
    return (
      <Text testID={`icon-${name}`} style={{ color, fontSize: size }}>
        {name}
      </Text>
    );
  };
});

afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };

describe('<BrandGlyph>', () => {
  test.each(['logo-google', 'logo-apple'] as const)('draws the %s logo', async (name) => {
    await render(<BrandGlyph name={name} />);
    expect(screen.getByTestId(`icon-${name}`, hidden)).toBeTruthy();
  });

  test('is inked with the kit’s foreground, so it follows the four themes', async () => {
    const spy = jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockReturnValue('rgb(1, 2, 3)' as never);
    await render(<BrandGlyph name="logo-google" />);

    expect(spy).toHaveBeenCalledWith('foreground');
    const style = StyleSheet.flatten(
      screen.getByTestId('icon-logo-google', hidden).props.style,
    );
    expect(style.color).toBe('rgb(1, 2, 3)');
  });

  test('is 20 dp by default and takes the other icon sizes', async () => {
    const { rerender } = await render(<BrandGlyph name="logo-apple" />);
    const size = () =>
      StyleSheet.flatten(screen.getByTestId('icon-logo-apple', hidden).props.style)
        .fontSize;
    expect(size()).toBe(20);

    await rerender(<BrandGlyph name="logo-apple" size={24} />);
    expect(size()).toBe(24);
  });

  test('is decorative: hidden from assistive technology on both platforms', async () => {
    await render(<BrandGlyph name="logo-google" />);

    // A screen reader finds no image to announce: the button around it says everything.
    expect(screen.queryByTestId('brand-glyph')).toBeNull();
    const wrapper = screen.getByTestId('brand-glyph', hidden);
    expect(wrapper.props.accessible).toBe(false);
    expect(wrapper.props.accessibilityElementsHidden).toBe(true);
    expect(wrapper.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
