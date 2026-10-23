/**
 * `BrandGlyph` - feature 004, T446 (FR-024, FR-030; research D4-08), reduced by F12 to Google's
 * logo: Apple's logo is drawn by Apple's own button, never by this adapter (owner decision
 * 2026-10-22; `test/no-handmade-apple-logo.test.ts`).
 *
 * What the adapter owns is the four-colour "G" in the brand's own colours in every scheme, its
 * size, and that the glyph is decorative: the control it sits in is named by its own label.
 */
import { render, screen } from '@testing-library/react-native';

import { GoogleG } from '@/theme/brand-artwork';

import { BrandGlyph } from './brand-glyph';

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

describe('<BrandGlyph>', () => {
  test('Google: the four-colour G in its own artwork colours, in every scheme', async () => {
    await render(<BrandGlyph name="logo-google" />);
    const fills = screen
      .getAllByTestId('svg-Path', hidden)
      .map((node) => node.props.fill);
    for (const { fill } of GoogleG.paths) expect(fills).toContain(fill);
    expect(new Set(GoogleG.paths.map((path) => path.fill)).size).toBe(4);
  });

  test('is 20 dp by default and takes the other icon sizes', async () => {
    const { rerender } = await render(<BrandGlyph name="logo-google" />);
    expect(screen.getByTestId('svg-Svg', hidden).props.width).toBe(20);
    expect(screen.getByTestId('svg-Svg', hidden).props.height).toBe(20);

    await rerender(<BrandGlyph name="logo-google" size={24} />);
    const svg = screen.getByTestId('svg-Svg', hidden);
    expect(svg.props.viewBox).toBe(`0 0 ${GoogleG.box} ${GoogleG.box}`);
    expect(svg.props.width).toBe(24);
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
