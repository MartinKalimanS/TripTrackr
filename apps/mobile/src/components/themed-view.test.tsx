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

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    elevationProfile: 'full',
    tokens: Colors.light,
  } as AppearanceContext);
});

function styleOf(testID: string) {
  const style = screen.getByTestId(testID).props.style;
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
}

describe('<ThemedView>', () => {
  test('falls back to the legacy colour type when no treatment is given', async () => {
    await render(<ThemedView testID="v" type="canvas" />);
    expect(styleOf('v').backgroundColor).toBe(Colors.light.canvas);
    expect(styleOf('v').boxShadow).toBeUndefined();
  });

  test('applies a neumorphic treatment when one is given', async () => {
    await render(<ThemedView testID="v" treatment="raised" />);
    expect(styleOf('v').boxShadow).toHaveLength(2);
  });

  test('treatment supersedes type rather than fighting it', async () => {
    await render(<ThemedView testID="v" type="background" treatment="raised" />);
    // `background` is #ffffff; the treatment's surface must win.
    expect(styleOf('v').backgroundColor).toBe(Colors.light.surface);
  });

  test('marks pending content even without an explicit treatment (FR-007)', async () => {
    await render(<ThemedView testID="v" pending />);
    expect(styleOf('v').borderColor).toBe(Colors.light.accent);
  });

  test('does not spread lightColor/darkColor onto the native view', async () => {
    await render(<ThemedView testID="v" lightColor="#fff" darkColor="#000" />);
    expect(screen.getByTestId('v').props.lightColor).toBeUndefined();
    expect(screen.getByTestId('v').props.darkColor).toBeUndefined();
  });
});
