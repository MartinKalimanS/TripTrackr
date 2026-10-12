/**
 * T097 — the statistics overlay (FR-050, Acceptance Scenario 3.5); restyled by feature
 * 004 (T428; FR-018, FR-033, contract C4-10, research D4-11).
 *
 * It floats over map content, so it is an opaque `Card overMap`: the `surface` fill, a
 * hairline `border`, no shadow and no translucency, so it reads over the lightest and
 * the darkest part of the globe alike. Its two figures are in the display face with
 * tabular numerals. Under Jest the kit renders plain views that carry the classes they
 * were given, so what is pinned here is what the overlay ASKED for; how a class looks is
 * Uniwind's, on a device (tasks.md T428).
 */
import { render, screen } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';
import { StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { liftOf } from '@/theme';

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
    tokens: Colors.light,
  });
});

const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const classesOf = (testID: string) => tokens(screen.getByTestId(testID).props.className);
const styleOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

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

  test('says "1 country" in the announcement for one', async () => {
    await render(<StatsOverlay summary={{ countriesVisited: 1, distanceKm: 0 }} />);
    expect(screen.getByTestId('globe-stats').props.accessibilityLabel).toMatch(
      /^1 country visited, /,
    );
  });
});

describe('<StatsOverlay> — an opaque card over the globe (FR-018, FR-033)', () => {
  const renderOverlay = () =>
    render(<StatsOverlay summary={{ countriesVisited: 3, distanceKm: 10 }} />);

  test('is the opaque surface with a hairline: bg-surface, border, border-separator', async () => {
    await renderOverlay();
    expect(classesOf('globe-stats-card')).toEqual(
      expect.arrayContaining(['bg-surface', 'border', 'border-separator']),
    );
  });

  test('carries only the second lift over the map', async () => {
    await renderOverlay();
    const classes = classesOf('globe-stats-card');
    expect(classes).toContain('shadow-none');
    expect(classes.filter((token) => /(^|:)(inset-|drop-)?shadow/.test(token))).toEqual([
      'shadow-none',
    ]);
    const style = styleOf('globe-stats-card');
    expect(style.boxShadow).toEqual(liftOf('light', 'lift2'));
    expect(style.elevation).toBeUndefined();
    expect(style.shadowColor).toBeUndefined();
  });

  test('is never translucent: no opacity suffix, no opacity or tint in the style', async () => {
    await renderOverlay();
    const classes = classesOf('globe-stats-card');
    expect(classes.filter((token) => token.includes('/'))).toEqual([]);
    expect(classes.filter((token) => /(^|:)(opacity|backdrop)/.test(token))).toEqual([]);
    const style = styleOf('globe-stats-card');
    expect(style.opacity).toBeUndefined();
    expect(style.backgroundColor).toBeUndefined();
  });

  test('keeps the announcement on the outer node: the card paints, it does not speak', async () => {
    await renderOverlay();
    expect(classesOf('globe-stats')).toEqual([]);
    expect(screen.getByTestId('globe-stats-card').props.accessible).toBeUndefined();
  });
});

describe('<StatsOverlay> — the figures (FR-004)', () => {
  test('are in the display face with tabular numerals, sized as a title', async () => {
    await render(<StatsOverlay summary={{ countriesVisited: 3, distanceKm: 12345.6 }} />);
    for (const id of ['globe-stat-countries', 'globe-stat-distance']) {
      expect(classesOf(id)).toEqual(
        expect.arrayContaining(['font-display', 'text-[22px]', 'text-foreground']),
      );
      expect(styleOf(id).fontVariant).toContain('tabular-nums');
    }
  });

  test('carry their labels in the muted caption role', async () => {
    await render(<StatsOverlay summary={{ countriesVisited: 3, distanceKm: 12345.6 }} />);
    for (const label of ['countries', 'travelled']) {
      const classes = tokens(screen.getByText(label).props.className);
      expect(classes).toEqual(expect.arrayContaining(['text-muted', 'text-[12px]']));
    }
  });
});

describe('<StatsOverlay> — built on the Atlas adapters only', () => {
  test('imports none of the retired primitives and never the kit', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('../stats-overlay'), 'utf8') as string;
    expect(source).not.toMatch(
      /from '@\/components\/(themed-text|themed-view|ui\/surface|ui\/pressable-surface)'/,
    );
    expect(source).not.toMatch(/from 'heroui-native|from 'uniwind/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/);
  });
});
