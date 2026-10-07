/**
 * T097 — the statistics overlay (FR-050, Acceptance Scenario 3.5).
 *
 * It floats over map content, so feature 002 contract C12 governs it: opaque
 * and bordered so it stays legible over light and dark imagery (FR-025), and
 * casting no shadow onto the map (FR-024).
 */
import { render, screen } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';
import { StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { StatsOverlay } from '../stats-overlay';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

// jest.setup.ts's en-GB locale; a test that switches system puts it back.
const defaultLocales = (getLocales as jest.Mock).getMockImplementation();

afterEach(() => {
  (getLocales as jest.Mock).mockImplementation(defaultLocales);
});

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    themeName: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    elevationProfile: 'full',
    tokens: Colors.light,
  });
});

describe('<StatsOverlay>', () => {
  test('shows countries visited and distance travelled', async () => {
    await render(<StatsOverlay summary={{ countriesVisited: 3, distanceKm: 12345.6 }} />);

    expect(screen.getByTestId('globe-stat-countries')).toHaveTextContent('3');
    expect(screen.getByText('countries')).toBeTruthy();
    expect(screen.getByTestId('globe-stat-distance')).toHaveTextContent('12,346 km');
    expect(screen.getByText('travelled')).toBeTruthy();
  });

  test('says "country" for one', async () => {
    await render(<StatsOverlay summary={{ countriesVisited: 1, distanceKm: 0 }} />);
    expect(screen.getByText('country')).toBeTruthy();
  });

  test('uses miles where the device measures distance in miles', async () => {
    (getLocales as jest.Mock).mockReturnValue([
      { languageTag: 'en-US', decimalSeparator: '.', measurementSystem: 'us' },
    ]);
    await render(<StatsOverlay summary={{ countriesVisited: 2, distanceKm: 12345.6 }} />);
    expect(screen.getByTestId('globe-stat-distance')).toHaveTextContent('7,671 mi');
  });

  test('is announced as one summary, in words', async () => {
    await render(<StatsOverlay summary={{ countriesVisited: 3, distanceKm: 12345.6 }} />);
    const overlay = screen.getByTestId('globe-stats');
    expect(overlay.props.accessible).toBe(true);
    expect(overlay.props.accessibilityRole).toBe('summary');
    expect(overlay.props.accessibilityLabel).toBe(
      '3 countries visited, 12,346 kilometres travelled',
    );
  });

  test('is opaque and bordered over the map, and casts no shadow onto it (C12)', async () => {
    await render(<StatsOverlay summary={{ countriesVisited: 3, distanceKm: 10 }} />);
    const style = StyleSheet.flatten(screen.getByTestId('globe-stats').props.style);
    expect(style.backgroundColor).toBe(Colors.light.surface);
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBe(Colors.light.border);
    expect(style.boxShadow).toBeUndefined();
  });
});
