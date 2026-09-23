/**
 * T019 — contract C10.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { TextField } from './text-field';

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

function styleOf(testID: string) {
  const style = screen.getByTestId(testID).props.style;
  return (
    (Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity)) : style) ?? {}
  );
}

beforeEach(() => mockAppearance());

describe('<TextField> — contract C10', () => {
  test('renders recessed so it reads as a place to type before being touched', async () => {
    await render(<TextField label="Destination" value="" onChangeText={jest.fn()} />);
    const { boxShadow } = styleOf('text-field-surface');
    expect(boxShadow.every((shadow: { inset: boolean }) => shadow.inset)).toBe(true);
  });

  test('falls back to the sunken fill in the reduced profile, never to a plain rectangle', async () => {
    mockAppearance({ elevationProfile: 'reduced' });
    await render(<TextField label="Destination" value="" onChangeText={jest.fn()} />);
    const style = styleOf('text-field-surface');
    expect(style.backgroundColor).toBe(Colors.light.surfaceSunk);
    expect(style.borderWidth).toBeGreaterThan(0);
  });

  test('is an interactive element, so it carries a compliant border (FR-009)', async () => {
    await render(<TextField label="Destination" value="" onChangeText={jest.fn()} />);
    const style = styleOf('text-field-surface');
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBe(Colors.light.border);
  });

  test('shows a focus indicator distinct from the recessed appearance (FR-012)', async () => {
    await render(<TextField label="Destination" value="" onChangeText={jest.fn()} />);
    const input = screen.getByLabelText('Destination');
    const before = styleOf('text-field-surface').borderColor;
    await fireEvent(input, 'focus');
    expect(styleOf('text-field-surface').borderColor).not.toBe(before);
  });

  test('reports its value changes', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Destination" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Destination'), 'Porto');
    expect(onChangeText).toHaveBeenCalledWith('Porto');
  });

  test('conveys an error by text as well as colour (FR-010)', async () => {
    await render(
      <TextField
        label="Destination"
        value=""
        onChangeText={jest.fn()}
        error="Required"
      />,
    );
    // The message itself is the non-colour signal — a red border alone would
    // be invisible to a traveller with colour vision deficiency.
    expect(screen.getByText('Required')).toBeTruthy();
    expect(styleOf('text-field-surface').borderColor).toBe(Colors.light.danger);
  });

  test('announces the error to assistive technology', async () => {
    await render(
      <TextField
        label="Destination"
        value=""
        onChangeText={jest.fn()}
        error="Required"
      />,
    );
    const input = screen.getByLabelText('Destination');
    expect(input.props['aria-invalid']).toBe(true);
  });
});
