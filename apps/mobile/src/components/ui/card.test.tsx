/**
 * T418 / T521 - contract C4-8 and C5-18 (`Card`, `Panel`), FR-002, FR-006, FR-018, FR-024,
 * FR-033, FR-034, FR-055, FR-069.
 *
 * The kit's Card is a plain View under Jest (test/mocks/heroui-native.tsx) that carries
 * every prop it was given, so what is asserted is what the adapter ASKED of the kit: the
 * semantic classes, the corner, the lift, the variant, and the accessibility contract on
 * the host node. Nothing here measures real styling; that the classes mean what they say
 * is read from the kit's stylesheet and the generated theme (see the header of `card.tsx`).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { StyleSheet, Text } from 'react-native';

import { Colors, MinTouchTarget } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { Radii, liftOf } from '@/theme';

import { touchDown } from '../../../test/helpers/touch';
import { Card, Panel, cardClasses } from './card';
import { glyphsIn } from '../../../test/helpers/icons';

jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-color-scheme');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const { useColorScheme } = jest.requireMock('@/hooks/use-color-scheme') as {
  useColorScheme: jest.Mock<'light' | 'dark', []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ...overrides,
  } as AppearanceContext);
}

beforeEach(() => {
  mockAppearance();
  useColorScheme.mockReturnValue('light');
});
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const classesOf = (testID: string) => tokens(screen.getByTestId(testID).props.className);
const styleOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

/** A shadow utility that DRAWS a shadow; `shadow-none` is how a shadow is cancelled. */
const drawsShadow = (token: string) =>
  /(^|:)(shadow|inset-shadow|drop-shadow)/.test(token) &&
  !/(^|:)shadow-none$/.test(token);

describe('<Card> variants - C5-18', () => {
  test('is a lift card by default: surface fill, hairline, and the first lift', async () => {
    await render(
      <Card testID="card">
        <Text>Lisbon</Text>
      </Card>,
    );
    const node = screen.getByTestId('card');
    expect(node.props.variant).toBe('default');
    expect(classesOf('card')).toEqual(
      expect.arrayContaining(['bg-surface', 'border', 'border-separator']),
    );
    expect(styleOf('card').boxShadow).toEqual(liftOf('light', 'lift1'));
    expect(screen.getByText('Lisbon')).toBeTruthy();
  });

  test('the kit shadow is always cancelled: the lift is the only shadow there is', async () => {
    for (const variant of ['lift', 'tile', 'flat'] as const) {
      await render(<Card testID={variant} variant={variant} />);
      expect(classesOf(variant).filter(drawsShadow)).toEqual([]);
      expect(classesOf(variant)).toContain('shadow-none');
    }
  });

  test('tile is the cream fill with a hairline and no shadow at all', async () => {
    await render(<Card testID="card" variant="tile" />);
    expect(screen.getByTestId('card').props.variant).toBe('secondary');
    expect(classesOf('card')).toEqual(
      expect.arrayContaining(['bg-surface-secondary', 'border', 'border-separator']),
    );
    expect(classesOf('card')).not.toContain('bg-surface');
    expect(styleOf('card').boxShadow).toBeUndefined();
  });

  test('flat has no fill, no edge and no shadow: it is a plain padded container', async () => {
    await render(
      <Card testID="card" variant="flat">
        <Text>Lisbon</Text>
      </Card>,
    );
    expect(screen.getByTestId('card').props.variant).toBe('transparent');
    expect(classesOf('card').some((token) => token.startsWith('bg-'))).toBe(false);
    expect(classesOf('card').some((token) => token.startsWith('border'))).toBe(false);
    expect(styleOf('card').boxShadow).toBeUndefined();
  });

  test.each([
    ['md', Radii.md],
    ['lg', Radii.lg],
    ['xl', Radii.xl],
    ['sheet', Radii.sheet],
  ] as const)('radius %s is a %i dp continuous corner', async (radius, value) => {
    await render(<Card testID="card" radius={radius} />);
    expect(styleOf('card')).toMatchObject({
      borderRadius: value,
      borderCurve: 'continuous',
    });
  });

  test.each([
    ['lift', Radii.xl],
    ['tile', Radii.lg],
    ['flat', Radii.lg],
  ] as const)('a %s card wears %i dp unless asked', async (variant, value) => {
    await render(<Card testID="card" variant={variant} />);
    expect(styleOf('card').borderRadius).toBe(value);
  });

  test('innerClassName and innerStyle apply to a plain card as well', async () => {
    await render(
      <Card testID="card" innerClassName="p-0" innerStyle={{ borderWidth: 1.5 }} />,
    );
    expect(classesOf('card')).toContain('p-0');
    expect(styleOf('card')).toMatchObject({ borderWidth: 1.5 });
  });

  test('keeps a caller layout style and className, and forwards testID', async () => {
    await render(
      <Card testID="card" className="self-stretch" style={{ marginTop: 12 }} />,
    );
    expect(classesOf('card')).toContain('self-stretch');
    expect(styleOf('card')).toMatchObject({ marginTop: 12 });
  });

  test('the lift follows the device scheme: the dark lift is a ring and a tonal shadow', async () => {
    useColorScheme.mockReturnValue('dark');
    await render(<Card testID="card" />);
    expect(styleOf('card').boxShadow).toEqual(liftOf('dark', 'lift1'));
  });
});

describe('<Card overMap> - FR-018, FR-033, C5-18', () => {
  const renderOverMap = (props: Record<string, unknown> = {}) =>
    render(
      <Card testID="card" overMap {...props}>
        <Text>Plan a trip</Text>
      </Card>,
    );

  test('is the opaque surface fill with a hairline edge', async () => {
    await renderOverMap();
    expect(screen.getByTestId('card').props.variant).toBe('default');
    expect(classesOf('card')).toEqual(
      expect.arrayContaining(['bg-surface', 'border', 'border-separator']),
    );
  });

  test('carries the second lift, and no other shadow', async () => {
    await renderOverMap();
    expect(styleOf('card').boxShadow).toEqual(liftOf('light', 'lift2'));
    expect(classesOf('card')).toContain('shadow-none');
    expect(classesOf('card').filter(drawsShadow)).toEqual([]);
  });

  test.each(['lift', 'tile', 'flat'] as const)(
    'a %s variant is opaque and lifted just the same over the map',
    async (variant) => {
      await renderOverMap({ variant });
      expect(classesOf('card')).toContain('bg-surface');
      expect(screen.getByTestId('card').props.variant).toBe('default');
      expect(styleOf('card').boxShadow).toEqual(liftOf('light', 'lift2'));
    },
  );

  test('is never translucent: no opacity suffix, no opacity class, no alpha style', async () => {
    await renderOverMap();
    const all = classesOf('card');
    expect(all.filter((token) => token.includes('/'))).toEqual([]);
    expect(
      all.filter((token) => /(^|:)(opacity|bg-opacity|backdrop)/.test(token)),
    ).toEqual([]);
    expect(all.filter((token) => /transparent/.test(token))).toEqual([]);
    expect(screen.getByTestId('card').props.variant).not.toBe('transparent');
    const style = styleOf('card');
    expect(style.opacity).toBeUndefined();
    expect(style.backgroundColor).toBeUndefined();
  });

  test('uses only semantic colour classes, never a literal', async () => {
    await renderOverMap({ pending: true });
    for (const token of classesOf('card')) {
      expect(token).not.toMatch(/\[|#|rgb|hsl/);
    }
  });

  test('stays opaque while pressed too', () => {
    const pressed = tokens(
      cardClasses({ variant: 'lift', overMap: true, pending: false, pressed: true }),
    );
    expect(pressed).toEqual(
      expect.arrayContaining([
        'bg-surface-tertiary',
        'border',
        'border-separator',
        'shadow-none',
      ]),
    );
    expect(pressed.filter((token) => token.includes('/'))).toEqual([]);
    expect(pressed.filter(drawsShadow)).toEqual([]);
  });
});

describe('<Card pending> - FR-034, C5-18', () => {
  test('swaps the hairline for a dashed amber-line edge and nothing else', async () => {
    await render(<Card testID="card" pending />);
    expect(classesOf('card')).toEqual(
      expect.arrayContaining([
        'bg-surface',
        'border',
        'border-dashed',
        'border-amber-line',
      ]),
    );
    expect(classesOf('card')).not.toContain('border-separator');
  });

  test('a tile that is pending keeps its fill and its lack of a lift', async () => {
    await render(<Card testID="card" variant="tile" pending />);
    expect(classesOf('card')).toEqual(
      expect.arrayContaining([
        'bg-surface-secondary',
        'border-dashed',
        'border-amber-line',
      ]),
    );
    expect(styleOf('card').boxShadow).toBeUndefined();
  });

  test('over the map the dashed pending edge replaces the hairline, it does not stack on it', async () => {
    await render(<Card testID="card" overMap pending />);
    const all = classesOf('card');
    expect(all).toEqual(
      expect.arrayContaining([
        'border',
        'border-dashed',
        'border-amber-line',
        'shadow-none',
      ]),
    );
    expect(all).not.toContain('border-separator');
    expect(styleOf('card').boxShadow).toEqual(liftOf('light', 'lift2'));
  });

  test('is not announced by itself: the SyncBadge stays the text and icon marker', async () => {
    await render(<Card testID="card" pending />);
    const node = screen.getByTestId('card');
    expect(node.props.accessibilityLabel).toBeUndefined();
    expect(node.props.accessibilityRole).toBeUndefined();
  });
});

describe('cardClasses - the pure mapping', () => {
  const base = {
    variant: 'lift',
    overMap: false,
    pending: false,
    pressed: false,
  } as const;

  test('a held press swaps to the pressed fill at once, on every variant', () => {
    for (const variant of ['lift', 'tile', 'flat'] as const) {
      const held = tokens(cardClasses({ ...base, variant, pressed: true }));
      expect(held).toContain('bg-surface-tertiary');
      expect(held.filter((token) => token.startsWith('bg-'))).toHaveLength(1);
    }
  });

  test('every class is a literal the stylesheet scan can find', () => {
    const everything = [
      cardClasses(base),
      cardClasses({ ...base, variant: 'tile' }),
      cardClasses({ ...base, variant: 'flat' }),
      cardClasses({ ...base, overMap: true }),
      cardClasses({ ...base, pending: true }),
      cardClasses({ ...base, overMap: true, pending: true, pressed: true }),
    ]
      .join(' ')
      .split(/\s+/)
      .filter(Boolean);
    expect([...new Set(everything)].sort()).toEqual(
      [
        'bg-surface',
        'bg-surface-secondary',
        'bg-surface-tertiary',
        'border',
        'border-amber-line',
        'border-dashed',
        'border-separator',
        'shadow-none',
      ].sort(),
    );
  });
});

describe('<Card> with nothing to press - a plain container', () => {
  test('is not a control: no role, no press, no chevron', async () => {
    await render(
      <Card testID="card">
        <Text>Lisbon</Text>
      </Card>,
    );
    const node = screen.getByTestId('card');
    expect(node.props.accessibilityRole).toBeUndefined();
    expect(node.props.onPress).toBeUndefined();
    expect(glyphsIn()).toEqual([]);
  });

  test('passes a name, hint and role through when the caller gives one (a notice)', async () => {
    await render(
      <Card
        testID="card"
        accessibilityRole="alert"
        accessibilityLabel="Offline"
        accessibilityHint="Changes sync later">
        <Text>Offline</Text>
      </Card>,
    );
    const node = screen.getByTestId('card');
    expect(node.props.accessibilityRole).toBe('alert');
    expect(node.props.accessibilityLabel).toBe('Offline');
    expect(node.props.accessibilityHint).toBe('Changes sync later');
  });
});

describe('<Card onPress> is ONE control - FR-024, FR-026', () => {
  const renderPressable = (props: Record<string, unknown> = {}) =>
    render(
      <Card
        testID="trip-card"
        accessibilityLabel="Lisbon, planning, 3 stops"
        onPress={jest.fn()}
        {...props}>
        <Text>Lisbon</Text>
      </Card>,
    );

  test('is a button with the given name, and testID lands on that node', async () => {
    await renderPressable({ accessibilityHint: 'Opens the trip' });
    const node = screen.getByTestId('trip-card');
    expect(node).toBe(screen.getByLabelText('Lisbon, planning, 3 stops'));
    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessible).not.toBe(false);
    expect(node.props.accessibilityHint).toBe('Opens the trip');
  });

  test('forwards an accessibility value, so a figure is said after the name (T544)', async () => {
    await renderPressable({ accessibilityValue: { text: '128' } });
    expect(screen.getByTestId('trip-card').props.accessibilityValue).toEqual({
      text: '128',
    });
  });

  test('presses once through the one control', async () => {
    const onPress = jest.fn();
    await renderPressable({ onPress });
    await fireEvent.press(screen.getByTestId('trip-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('puts the surface inside the control, so there is one control and one fill', async () => {
    await renderPressable();
    const surface = screen.getByTestId('trip-card-surface');
    expect(surface.props.accessibilityRole).toBeUndefined();
    expect(surface.props.onPress).toBeUndefined();
    expect(classesOf('trip-card-surface')).toContain('bg-surface');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  // T460 - FR-019, SC-005: the card shows its held look as the finger lands, before release.
  test('swaps the surface to the pressed fill as the finger lands, and not before', async () => {
    jest.useFakeTimers();
    try {
      await renderPressable();
      expect(classesOf('trip-card-surface')).toContain('bg-surface');
      expect(classesOf('trip-card-surface')).not.toContain('bg-surface-tertiary');

      await touchDown(screen.getByTestId('trip-card'));

      expect(classesOf('trip-card-surface')).toContain('bg-surface-tertiary');
      expect(classesOf('trip-card-surface')).not.toContain('bg-surface');
    } finally {
      jest.useRealTimers();
    }
  });

  test('a busy or disabled card shows no pressed fill when touched', async () => {
    for (const state of ['busy', 'disabled']) {
      await renderPressable({ testID: state, [state]: true });
      await touchDown(screen.getByTestId(state));
      expect(classesOf(`${state}-surface`)).not.toContain('bg-surface-tertiary');
    }
  });

  test('disabled and busy are announced and ignore presses (Tappable semantics)', async () => {
    const onPress = jest.fn();
    await renderPressable({ onPress, disabled: true });
    const node = screen.getByTestId('trip-card');
    await fireEvent.press(node);
    expect(onPress).not.toHaveBeenCalled();
    expect(node.props.accessibilityState).toMatchObject({ disabled: true, busy: false });

    await renderPressable({ onPress, busy: true });
    const busy = screen.getAllByTestId('trip-card').at(-1);
    expect(busy?.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  test('busy and disabled together is a development error', async () => {
    await expect(renderPressable({ busy: true, disabled: true })).rejects.toThrow(
      /mutually exclusive/,
    );
  });

  test('refuses to render a pressable card without an accessible name', async () => {
    await expect(
      render(
        // @ts-expect-error - the name is required by the type whenever there is an onPress
        <Card onPress={jest.fn()}>
          <Text>Lisbon</Text>
        </Card>,
      ),
    ).rejects.toThrow(/accessibilityLabel/);
    await expect(renderPressable({ accessibilityLabel: '  ' })).rejects.toThrow(
      /accessibilityLabel/,
    );
  });

  test('is never smaller than the platform minimum and grows with the text size', async () => {
    await renderPressable();
    expect(styleOf('trip-card').minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
    mockAppearance({ fontScale: 2 });
    await renderPressable({ testID: 'big' });
    expect(styleOf('big').minHeight).toBe(MinTouchTarget * 2);
    expect(styleOf('big').height).toBeUndefined();
  });

  test('wears the card corner on the control, so the focus ring follows the card', async () => {
    await renderPressable({ radius: 'xl' });
    expect(styleOf('trip-card')).toMatchObject({ borderRadius: Radii.xl });
    expect(styleOf('trip-card-surface')).toMatchObject({ borderRadius: Radii.xl });
  });

  test('its pressed fill is the card surface, not a second fill behind it', async () => {
    await renderPressable();
    expect(styleOf('trip-card').backgroundColor).toBe('transparent');
  });

  test('keeps a caller layout style and className on the control', async () => {
    await renderPressable({ className: 'self-stretch', style: { marginTop: 12 } });
    expect(classesOf('trip-card')).toContain('self-stretch');
    expect(styleOf('trip-card')).toMatchObject({ marginTop: 12 });
  });

  test('innerClassName and innerStyle reach the surface, not the control', async () => {
    await renderPressable({
      innerClassName: 'p-0',
      innerStyle: { borderWidth: 1.5 },
    });
    expect(classesOf('trip-card-surface')).toContain('p-0');
    expect(classesOf('trip-card')).not.toContain('p-0');
    expect(styleOf('trip-card-surface')).toMatchObject({ borderWidth: 1.5 });
    expect(styleOf('trip-card').borderWidth).toBeUndefined();
  });

  test('works over the map: opaque, hairline, the second lift, and still one control', async () => {
    await renderPressable({ overMap: true });
    expect(classesOf('trip-card-surface')).toEqual(
      expect.arrayContaining(['bg-surface', 'border', 'border-separator', 'shadow-none']),
    );
    expect(styleOf('trip-card-surface').boxShadow).toEqual(liftOf('light', 'lift2'));
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  test('a pressed tile card swaps its cream for the pressed fill and keeps no lift', async () => {
    jest.useFakeTimers();
    try {
      await renderPressable({ variant: 'tile' });
      expect(screen.getByTestId('trip-card-surface').props.variant).toBe('secondary');
      expect(classesOf('trip-card-surface')).toContain('bg-surface-secondary');
      await touchDown(screen.getByTestId('trip-card'));
      expect(screen.getByTestId('trip-card-surface').props.variant).toBe('tertiary');
      expect(classesOf('trip-card-surface')).toContain('bg-surface-tertiary');
      expect(classesOf('trip-card-surface')).not.toContain('bg-surface-secondary');
      expect(styleOf('trip-card-surface').boxShadow).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a pressable lift card keeps its lift on the surface while held', async () => {
    jest.useFakeTimers();
    try {
      await renderPressable();
      await touchDown(screen.getByTestId('trip-card'));
      expect(styleOf('trip-card-surface').boxShadow).toEqual(liftOf('light', 'lift1'));
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('<Card onPress> names its cue - FR-024', () => {
  const NAME = 'chevron-right';

  test('shows a trailing chevron at the muted ink by default, decorative', async () => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    useThemeColor.mockReturnValue('#123456' as never);
    await render(
      <Card testID="card" accessibilityLabel="Lisbon" onPress={jest.fn()}>
        <Text>Lisbon</Text>
      </Card>,
    );
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: NAME, color: '#123456' }),
    ]);
    expect(useThemeColor).toHaveBeenCalledWith('muted');
    expect(screen.getByTestId('card-cue', hidden).props.accessible).toBe(false);
    expect(screen.getByText('Lisbon')).toBeTruthy();
  });

  test('cue={false} leaves it out for a card that supplies its own trailing cue', async () => {
    await render(
      <Card testID="card" accessibilityLabel="Lisbon" onPress={jest.fn()} cue={false}>
        <Text>Lisbon, Open</Text>
      </Card>,
    );
    expect(glyphsIn()).toEqual([]);
    expect(screen.getByText('Lisbon, Open')).toBeTruthy();
  });

  test('a plain container has no chevron', async () => {
    await render(
      <Card testID="card">
        <Text>Lisbon</Text>
      </Card>,
    );
    expect(glyphsIn()).toEqual([]);
  });
});

describe('a Card never contains a Card - FR-006', () => {
  test('a card inside a card is a development error that says why', async () => {
    await expect(
      render(
        <Card>
          <Card>
            <Text>Inner</Text>
          </Card>
        </Card>,
      ),
    ).rejects.toThrow(/Card.*never contains.*(another|a) card/i);
  });

  test('the same holds for a pressable card, on either side', async () => {
    await expect(
      render(
        <Card accessibilityLabel="Outer" onPress={jest.fn()}>
          <Card>
            <Text>Inner</Text>
          </Card>
        </Card>,
      ),
    ).rejects.toThrow(/never contains/);
    await expect(
      render(
        <Card>
          <Card accessibilityLabel="Inner" onPress={jest.fn()}>
            <Text>Inner</Text>
          </Card>
        </Card>,
      ),
    ).rejects.toThrow(/never contains/);
  });

  test('it holds through other containers in between', async () => {
    await expect(
      render(
        <Card>
          <Panel title="Details">
            <Card>
              <Text>Inner</Text>
            </Card>
          </Panel>
        </Card>,
      ),
    ).rejects.toThrow(/never contains/);
  });

  test('siblings, and a card inside a panel, are fine', async () => {
    await render(
      <>
        <Card testID="one" />
        <Card testID="two" />
        <Panel title="Details">
          <Card testID="three" />
        </Panel>
      </>,
    );
    expect(screen.getByTestId('one')).toBeTruthy();
    expect(screen.getByTestId('two')).toBeTruthy();
    expect(screen.getByTestId('three')).toBeTruthy();
  });

  test('leaves a release build alone: the guard is a development check', async () => {
    const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      await render(
        <Card>
          <Card testID="inner" />
        </Card>,
      );
      expect(screen.getByTestId('inner')).toBeTruthy();
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
    }
  });
});

describe('<Panel> - a flat, borderless grouping container', () => {
  test('draws no fill, no boundary and no shadow, and is not a kit surface', async () => {
    await render(
      <Panel testID="panel">
        <Text>Body</Text>
      </Panel>,
    );
    const node = screen.getByTestId('panel');
    expect(node.props.variant).toBeUndefined();
    const all = classesOf('panel');
    expect(all.filter(drawsShadow)).toEqual([]);
    expect(all.some((token) => token.startsWith('border'))).toBe(false);
    expect(all.some((token) => token.startsWith('bg-'))).toBe(false);
    expect(all.some((token) => /^(p|px|py|pt|pb)-/.test(token))).toBe(false);
    expect(screen.getByText('Body')).toBeTruthy();
  });

  test('the title is optional, a headline, and a heading for assistive technology', async () => {
    await render(<Panel testID="panel" />);
    expect(screen.queryByRole('header')).toBeNull();

    await render(
      <Panel testID="titled" title="Spending">
        <Text>Body</Text>
      </Panel>,
    );
    const title = screen.getByText('Spending');
    expect(title.props.accessibilityRole).toBe('header');
    expect(tokens(title.props.className)).toEqual(
      expect.arrayContaining(['font-display-bold', 'text-foreground']),
    );
  });

  test('keeps a caller layout className and forwards testID', async () => {
    await render(<Panel testID="panel" className="self-stretch" />);
    expect(classesOf('panel')).toEqual(expect.arrayContaining(['self-stretch']));
  });
});
