/**
 * T043–T046 — contract C9, data-model §5.
 *
 * The state machine is asserted through the resolved style, because that is
 * what a traveller actually sees. The most important assertion here is the
 * discreteness one: state changes are token swaps, not interpolations, which is
 * what buys the 100 ms budget (SC-005), the list performance (SC-006), and
 * reduced-motion support for free (FR-015).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Colors, Radius } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { surfaceStyle } from '@/theme/surfaces';

import { PressableSurface, bareStyle, treatmentFor } from './pressable-surface';

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

/** The style currently applied to the control, flattened. */
function currentStyle() {
  const style = screen.getByLabelText('Save trip').props.style;
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
}

beforeEach(() => mockAppearance());

describe('<PressableSurface> state machine — data-model §5', () => {
  test('maps every interaction state to its treatment (FR-018, FR-019, FR-020)', () => {
    const state = (
      o: Partial<Record<'pressed' | 'busy' | 'disabled', boolean>> = {},
    ) => ({
      pressed: false,
      busy: false,
      disabled: false,
      ...o,
    });

    expect(treatmentFor('raised', state())).toBe('raised');
    expect(treatmentFor('raised', state({ pressed: true }))).toBe('pressed');
    expect(treatmentFor('raised', state({ busy: true }))).toBe('busy');
    expect(treatmentFor('raised', state({ disabled: true }))).toBe('disabled');

    // Unavailability outranks everything: a disabled control that is also being
    // pressed must not appear to respond.
    expect(treatmentFor('raised', state({ pressed: true, disabled: true }))).toBe(
      'disabled',
    );
    expect(treatmentFor('raised', state({ pressed: true, busy: true }))).toBe('busy');
  });

  test('may rest recessed — the selected-tab affordance — and still be a control (R009)', async () => {
    await render(
      <PressableSurface
        treatment="recessed"
        accessibilityLabel="Save trip"
        onPress={jest.fn()}
      />,
    );
    const style = currentStyle();
    const shadows = style.boxShadow as unknown as { inset: boolean }[];

    expect(shadows.every((s) => s.inset)).toBe(true);
    // Recessed does not mean decorative: the compliance border and the touch
    // target are what make it a control rather than a well (FR-009, FR-011).
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(
      treatmentFor('recessed', { pressed: false, busy: false, disabled: false }),
    ).toBe('recessed');
  });

  test('rests raised and sinks when pressed (FR-018)', async () => {
    await render(<PressableSurface accessibilityLabel="Save trip" onPress={jest.fn()} />);

    // Resting, as actually rendered.
    const resting = currentStyle().boxShadow as unknown as { inset: boolean }[];
    expect(resting.every((s) => !s.inset)).toBe(true);

    // Held, via the recipe the mapping above selects.
    const held = surfaceStyle('pressed', {
      theme: 'light',
      profile: 'full',
      depth: 1,
      radius: 'md',
      interactive: true,
    }).boxShadow as unknown as { inset: boolean }[];
    expect(held.every((s) => s.inset)).toBe(true);
  });

  test('transitions are discrete token swaps with no interpolation (R-004)', async () => {
    await render(<PressableSurface accessibilityLabel="Save trip" onPress={jest.fn()} />);

    // Every state resolves to a fixed recipe. An interpolated implementation
    // would produce intermediate values that match no recipe at all.
    const options = {
      theme: 'light',
      profile: 'full',
      depth: 1,
      radius: 'md',
      interactive: true,
    } as const;
    for (const treatment of ['raised', 'pressed', 'busy', 'disabled'] as const) {
      const style = surfaceStyle(treatment, options);
      expect(style).toEqual(surfaceStyle(treatment, options));
      expect(style).not.toHaveProperty('transitionDuration');
      expect(style).not.toHaveProperty('transform');
    }

    // And the rendered resting style is exactly the raised recipe.
    expect(currentStyle().boxShadow).toEqual(surfaceStyle('raised', options).boxShadow);
  });

  test('fires onPress when it is available', async () => {
    const onPress = jest.fn();
    await render(<PressableSurface accessibilityLabel="Save trip" onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Save trip'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('busy rejects further presses and is announced in progress (FR-020)', async () => {
    const onPress = jest.fn();
    await render(
      <PressableSurface accessibilityLabel="Save trip" busy onPress={onPress} />,
    );

    const node = screen.getByLabelText('Save trip');
    await fireEvent.press(node);

    expect(onPress).not.toHaveBeenCalled();
    expect(node.props.accessibilityState).toMatchObject({ busy: true });
  });

  test('disabled is flat, inert, and announced unavailable (FR-019)', async () => {
    const onPress = jest.fn();
    await render(
      <PressableSurface accessibilityLabel="Save trip" disabled onPress={onPress} />,
    );

    const node = screen.getByLabelText('Save trip');
    await fireEvent.press(node);

    expect(onPress).not.toHaveBeenCalled();
    expect(node.props.accessibilityState).toMatchObject({ disabled: true });
    // Flat: no depth at all, so it does not read as actionable.
    expect(currentStyle().boxShadow).toBeUndefined();
  });

  test('busy and disabled together is a development error (data-model §5)', async () => {
    // They are mutually exclusive: a control cannot be both working and
    // unavailable, and rendering one silently would hide a state bug.
    await expect(
      render(
        <PressableSurface
          accessibilityLabel="Save trip"
          busy
          disabled
          onPress={jest.fn()}
        />,
      ),
    ).rejects.toThrow(/mutually exclusive/);
  });

  test('always carries the compliant border — it identifies a control (FR-009)', async () => {
    await render(<PressableSurface accessibilityLabel="Save trip" onPress={jest.fn()} />);
    const style = currentStyle();
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBe(Colors.light.border);
  });

  test('exposes a touch target no smaller than the platform minimum (FR-011)', async () => {
    await render(<PressableSurface accessibilityLabel="Save trip" onPress={jest.fn()} />);
    const style = currentStyle();
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
  });

  test('announces itself as a button with its label', async () => {
    await render(<PressableSurface accessibilityLabel="Save trip" onPress={jest.fn()} />);
    expect(screen.getByLabelText('Save trip').props.accessibilityRole).toBe('button');
  });
});

describe('<PressableSurface bare> — a control that is its own glyph (feature 003, FR-014, FR-016)', () => {
  const renderBare = (props: Record<string, unknown> = {}) =>
    render(
      <PressableSurface
        bare
        accessibilityLabel="Save trip"
        onPress={jest.fn()}
        {...props}
      />,
    );

  test('rests with no fill, no border and no shadow', async () => {
    await renderBare();
    const style = currentStyle();

    expect(style.boxShadow).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
    expect(style.backgroundColor).toBeUndefined();
  });

  test('keeps the platform minimum touch target (FR-011)', async () => {
    await renderBare();
    expect(currentStyle().minHeight).toBeGreaterThanOrEqual(44);
    expect(currentStyle().minWidth).toBeGreaterThanOrEqual(44);
  });

  test('grows the touch target with the text size (FR-016)', async () => {
    mockAppearance({ fontScale: 2 });
    await renderBare();
    expect(currentStyle().minHeight).toBeGreaterThanOrEqual(88);
  });

  test('keeps the focus ring, and drops it again on blur (FR-012)', async () => {
    await renderBare();
    const node = screen.getByLabelText('Save trip');

    await fireEvent(node, 'focus');
    expect(currentStyle()).toMatchObject({
      borderWidth: 2,
      borderColor: Colors.light.accent,
    });

    await fireEvent(node, 'blur');
    expect(currentStyle().borderWidth).toBeUndefined();
  });

  test('still presses, announces itself a button, and is inert when busy or disabled', async () => {
    const onPress = jest.fn();
    await renderBare({ onPress });
    await fireEvent.press(screen.getByLabelText('Save trip'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Save trip').props.accessibilityRole).toBe('button');

    const inert = jest.fn();
    await renderBare({ onPress: inert, disabled: true, accessibilityLabel: 'Other' });
    await fireEvent.press(screen.getByLabelText('Other'));
    expect(inert).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Other').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});

describe('bareStyle — the recipes behind it', () => {
  const options = { theme: 'light', profile: 'full', radius: 'md' } as const;

  test('rest is only the corner, so a press has a shape to fill', () => {
    const style = bareStyle('flat', options);
    expect(style.borderRadius).toBe(Radius.md);
    expect(style.backgroundColor).toBeUndefined();
    expect(style.boxShadow).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
  });

  test('a held press is a discrete swap to the sunken fill, in either theme (FR-018)', () => {
    for (const theme of ['light', 'dark'] as const) {
      const style = bareStyle('pressed', { ...options, theme });
      expect(style.backgroundColor).toBe(Colors[theme].surfaceSunk);
      expect(style.boxShadow).toBeUndefined();
      expect(style.borderWidth).toBeUndefined();
    }
  });

  test('busy and disabled dim exactly as every other surface does (FR-019, FR-020)', () => {
    for (const treatment of ['busy', 'disabled'] as const) {
      expect(bareStyle(treatment, options).opacity).toBe(
        surfaceStyle(treatment, { ...options, interactive: true }).opacity,
      );
    }
  });
});
