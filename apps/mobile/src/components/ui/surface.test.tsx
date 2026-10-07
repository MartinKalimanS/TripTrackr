/**
 * T018 — contract C8.
 *
 * The appearance hook is mocked so each profile and theme can be exercised
 * without a device. What is asserted here is the contract, not the pixel
 * values: one view, no border on static surfaces, no accessibility side effects.
 */
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { Surface } from './surface';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  const theme = overrides.theme ?? 'light';
  useAppearance.mockReturnValue({
    theme,
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    elevationProfile: 'full',
    tokens: Colors[theme],
    ...overrides,
  } as AppearanceContext);
}

/** Flatten the style prop, which RN may hand back as a nested array. */
function styleOf(testID: string) {
  const style = screen.getByTestId(testID).props.style;
  const flat = Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity)) : style;
  return flat ?? {};
}

beforeEach(() => mockAppearance());

describe('<Surface> — contract C8', () => {
  test('renders its children inside a single view, with no wrapper', async () => {
    await render(
      <Surface testID="card">
        <Text>Lisbon</Text>
      </Surface>,
    );
    expect(screen.getByText('Lisbon')).toBeTruthy();
    // research R-001: the whole point of composed boxShadow is that ONE view
    // carries both shadows. A wrapper would double the view count on every row.
    expect(screen.getByTestId('card').children).toHaveLength(1);
  });

  test('applies two composed shadows for a raised treatment in the full profile', async () => {
    await render(<Surface testID="card" treatment="raised" />);
    const { boxShadow } = styleOf('card');
    expect(boxShadow).toHaveLength(2);
    expect(boxShadow[0].inset).toBe(false);
  });

  test('applies inset shadows for a recessed treatment', async () => {
    await render(<Surface testID="well" treatment="recessed" />);
    const { boxShadow } = styleOf('well');
    expect(boxShadow.every((shadow: { inset: boolean }) => shadow.inset)).toBe(true);
  });

  test('lights every surface from the same direction (FR-005)', async () => {
    await render(<Surface testID="card" treatment="raised" />);
    const { boxShadow } = styleOf('card');
    // Light shadow up-left, dark shadow down-right. Positive Y is DOWN
    // (research R-008.1, confirmed from the native implementations).
    expect(boxShadow[0].offsetX).toBeLessThan(0);
    expect(boxShadow[0].offsetY).toBeLessThan(0);
    expect(boxShadow[1].offsetX).toBeGreaterThan(0);
    expect(boxShadow[1].offsetY).toBeGreaterThan(0);
  });

  test('carries NO border for a static surface in the full profile', async () => {
    // research R-002: static surfaces are decorative and stay borderless, which
    // is what preserves the soft look across most of the visible area.
    await render(<Surface testID="card" treatment="raised" interactive={false} />);
    expect(styleOf('card').borderWidth).toBeUndefined();
  });

  test('falls back to the sunken fill when inset shadows are unavailable', async () => {
    mockAppearance({ elevationProfile: 'reduced' });
    await render(<Surface testID="well" treatment="recessed" />);
    const style = styleOf('well');
    expect(style.backgroundColor).toBe(Colors.light.surfaceSunk);
    // Never an undifferentiated flat rectangle (contract C10 rationale).
    expect(style.backgroundColor).not.toBe(Colors.light.surface);
  });

  test('renders no shadow at all in the flat profile', async () => {
    mockAppearance({ elevationProfile: 'flat' });
    await render(<Surface testID="card" treatment="raised" />);
    expect(styleOf('card').boxShadow).toBeUndefined();
  });

  test('keeps a separator hairline for a static card in the flat profile (004 D4-12)', async () => {
    mockAppearance({ elevationProfile: 'flat' });
    await render(<Surface testID="card" treatment="raised" />);
    const style = styleOf('card');
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBe(Colors.light.separator);
  });

  test('a flat dense row stays borderless in the flat profile', async () => {
    mockAppearance({ elevationProfile: 'flat' });
    await render(<Surface testID="row" treatment="flat" />);
    expect(styleOf('row').borderWidth).toBeUndefined();
  });

  test('uses the dark ramp under the dark theme', async () => {
    mockAppearance({ theme: 'dark' });
    await render(<Surface testID="card" treatment="raised" />);
    expect(styleOf('card').backgroundColor).toBe(Colors.dark.surface);
  });

  test('composes pending with a treatment rather than replacing it (FR-007)', async () => {
    await render(<Surface testID="card" treatment="raised" pending />);
    const style = styleOf('card');
    // Still a raised card...
    expect(style.boxShadow).toHaveLength(2);
    // ...and additionally marked unsynchronised.
    expect(style.borderColor).toBe(Colors.light.accent);
  });

  test('adds no accessibility role or label of its own (FR-017)', async () => {
    await render(
      <Surface testID="card">
        <Text>Lisbon</Text>
      </Surface>,
    );
    const card = screen.getByTestId('card');
    expect(card.props.accessibilityRole).toBeUndefined();
    expect(card.props.accessibilityLabel).toBeUndefined();
  });
});
