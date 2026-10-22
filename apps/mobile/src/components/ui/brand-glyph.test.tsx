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
import { StyleSheet } from 'react-native';

import { AppleButton, GoogleG } from '@/theme/brand-artwork';

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

jest.mock('react-native-svg', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const standIn = (kind: string) => {
    const StandIn = ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, { testID: `svg-${kind}`, ...props }, children);
    StandIn.displayName = kind;
    return StandIn;
  };
  const Svg = standIn('Svg');
  return { __esModule: true, default: Svg, Svg, Path: standIn('Path') };
});

let mockScheme: 'light' | 'dark' = 'light';
jest.mock('@/hooks/use-appearance', () => ({
  useAppearance: () => ({ theme: mockScheme }),
}));

beforeEach(() => {
  mockScheme = 'light';
});

describe('<BrandGlyph>', () => {
  test('Apple: the logo glyph, inked as the Apple button asks, per scheme', async () => {
    const { rerender } = await render(<BrandGlyph name="logo-apple" />);
    const ink = () =>
      StyleSheet.flatten(screen.getByTestId('icon-logo-apple', hidden).props.style).color;
    expect(ink()).toBe(AppleButton.light.ink);

    mockScheme = 'dark';
    await rerender(<BrandGlyph name="logo-apple" />);
    expect(ink()).toBe(AppleButton.dark.ink);
  });

  test('Google: the four-colour G in its own artwork colours, in every scheme', async () => {
    await render(<BrandGlyph name="logo-google" />);
    expect(screen.queryByTestId('icon-logo-google', hidden)).toBeNull();
    const fills = screen
      .getAllByTestId('svg-Path', hidden)
      .map((node) => node.props.fill);
    for (const { fill } of GoogleG.paths) expect(fills).toContain(fill);
    expect(new Set(GoogleG.paths.map((path) => path.fill)).size).toBe(4);
  });

  test('is 20 dp by default and takes the other icon sizes', async () => {
    const { rerender } = await render(<BrandGlyph name="logo-apple" />);
    const size = () =>
      StyleSheet.flatten(screen.getByTestId('icon-logo-apple', hidden).props.style)
        .fontSize;
    expect(size()).toBe(20);

    await rerender(<BrandGlyph name="logo-apple" size={24} />);
    expect(size()).toBe(24);

    await rerender(<BrandGlyph name="logo-google" size={24} />);
    const svg = screen.getByTestId('svg-Svg', hidden);
    expect(svg.props.viewBox).toBe(`0 0 ${GoogleG.box} ${GoogleG.box}`);
    expect(svg.props.width).toBe(24);
  });

  test.each(['logo-google', 'logo-apple'] as const)(
    '%s is decorative: hidden from assistive technology on both platforms',
    async (name) => {
      await render(<BrandGlyph name={name} />);

      // A screen reader finds no image to announce: the button around it says everything.
      expect(screen.queryByTestId('brand-glyph')).toBeNull();
      const wrapper = screen.getByTestId('brand-glyph', hidden);
      expect(wrapper.props.accessible).toBe(false);
      expect(wrapper.props.accessibilityElementsHidden).toBe(true);
      expect(wrapper.props.importantForAccessibility).toBe('no-hide-descendants');
    },
  );
});
