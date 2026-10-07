/**
 * Coverage for the treatment-aware ThemedView (T023).
 *
 * The important property is the precedence rule: `treatment` supersedes `type`,
 * because the treatment supplies the background as well as the depth and two
 * sources of truth for one colour is exactly what FR-028 forbids.
 */
import { render, screen } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { ThemedView } from './themed-view';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(theme: 'light' | 'dark' = 'light') {
  useAppearance.mockReturnValue({
    theme,
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    elevationProfile: 'full',
    tokens: Colors[theme],
  } as AppearanceContext);
}

beforeEach(() => mockAppearance());

function styleOf(testID: string) {
  const style = screen.getByTestId(testID).props.style;
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
}

describe('<ThemedView>', () => {
  test('paints the canvas when neither a type nor a treatment is given', async () => {
    // The scaffold defaulted to a white `background` token, which is how a
    // white bar ended up against the grey canvas (FR-023). The default is now
    // the canvas itself, so an unstyled view can never be the odd one out.
    await render(<ThemedView testID="v" />);
    expect(styleOf('v').backgroundColor).toBe(Colors.light.canvas);
    expect(styleOf('v').boxShadow).toBeUndefined();
  });

  test('fills with the named ramp token when no treatment is given', async () => {
    await render(<ThemedView testID="v" type="surfaceSunk" />);
    expect(styleOf('v').backgroundColor).toBe(Colors.light.surfaceSunk);
  });

  test('applies a neumorphic treatment when one is given', async () => {
    await render(<ThemedView testID="v" treatment="raised" />);
    expect(styleOf('v').boxShadow).toHaveLength(2);
  });

  test('treatment supersedes type rather than fighting it', async () => {
    await render(<ThemedView testID="v" type="surfaceSunk" treatment="raised" />);
    // The treatment's surface must win over the sunk fill.
    expect(styleOf('v').backgroundColor).toBe(Colors.light.surface);
  });

  test('marks pending content even without an explicit treatment (FR-007)', async () => {
    await render(<ThemedView testID="v" pending />);
    expect(styleOf('v').borderColor).toBe(Colors.light.accent);
  });

  test('follows the resolved theme through the single appearance resolver (C4)', async () => {
    mockAppearance('dark');
    await render(<ThemedView testID="v" />);
    expect(styleOf('v').backgroundColor).toBe(Colors.dark.canvas);
  });
});
