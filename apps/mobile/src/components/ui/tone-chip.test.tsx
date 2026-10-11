/**
 * T444 - `ToneChip`, the small state label of Atlas (contract C4-8; FR-023, FR-025,
 * FR-029, FR-030; review rules 3, 5 and 7).
 *
 * Jest renders the kit's text as plain host text that forwards every prop, so what is
 * asserted is the accessibility contract on the host nodes and the semantic classes the
 * chip ASKS for, never real styling (the contrast gate measures the pairs; the kit's
 * real render is `test/ui-kit/offline-maps-real-render.test.tsx`).
 */
import { render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';

import { ToneChip, type ToneChipTone } from './tone-chip';

jest.mock('expo-symbols', () => {
  const { View } = require('react-native');
  return {
    SymbolView: (props: Record<string, unknown>) => <View testID="symbol" {...props} />,
  };
});

afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const ICON = { ios: 'checkmark.circle', android: 'check_circle' } as const;
const TONES = ['muted', 'default', 'success', 'danger'] as const;
const classesOf = (element: { props: { className?: unknown } }) =>
  String(element.props.className ?? '').split(/\s+/);
const chip = () => screen.getByTestId('state-chip');

const renderChip = (props: Record<string, unknown> = {}) =>
  render(<ToneChip label="Ready offline" icon={ICON} testID="state-chip" {...props} />);

describe('<ToneChip> identity - FR-025, FR-030', () => {
  test('shows its words and an icon, so the state is never colour alone', async () => {
    await renderChip({ tone: 'success' });

    expect(screen.getByText('Ready offline')).toBeTruthy();
    const symbols = screen.getAllByTestId('symbol', hidden);
    expect(symbols).toHaveLength(1);
    expect(symbols[0]?.props.name).toEqual(ICON);
  });

  test('is ONE announced text element named by its label, or by the spoken form it is given', async () => {
    await renderChip();
    expect(chip().props.accessible).toBe(true);
    expect(chip().props.accessibilityRole).toBe('text');
    expect(chip().props.accessibilityLabel).toBe('Ready offline');

    await screen.rerender(
      <ToneChip
        label="Ready offline · 12.4 MB"
        accessibilityLabel="Ready offline, 12.4 megabytes"
        icon={ICON}
        testID="state-chip"
      />,
    );
    expect(chip().props.accessibilityLabel).toBe('Ready offline, 12.4 megabytes');
  });

  test('is a label, not a control: nothing to press, nothing to focus', async () => {
    await renderChip();
    expect(chip().props.onPress).toBeUndefined();
    expect(chip().props.focusable).toBeUndefined();
    expect(chip().props.accessibilityState).toBeUndefined();
  });

  test('keeps the icon decorative, and gives it an id derived from the chip’s', async () => {
    await renderChip();
    const icon = screen.getByTestId('state-chip-icon', hidden);
    expect(icon.props.accessible).toBe(false);
    expect(icon.props.accessibilityElementsHidden).toBe(true);
  });

  test('draws no id of its own when it is given none', async () => {
    await render(<ToneChip label="Ready offline" icon={ICON} />);
    expect(screen.queryByTestId('state-chip', hidden)).toBeNull();
    expect(screen.getByLabelText('Ready offline')).toBeTruthy();
  });
});

describe('<ToneChip> tone - FR-023, FR-025, review rules 3, 5 and 7', () => {
  const TONE: Record<ToneChipTone, { ink: string; fill: string | null; token: string }> =
    {
      muted: { ink: 'text-muted', fill: null, token: 'muted' },
      default: { ink: 'text-foreground', fill: null, token: 'foreground' },
      success: { ink: 'text-success', fill: 'bg-success/15', token: 'success' },
      danger: { ink: 'text-danger', fill: 'bg-danger/15', token: 'danger' },
    };

  test.each(TONES)(
    '%s asks for its ink, and its 15% soft fill if it has one',
    async (tone) => {
      await renderChip({ tone });

      expect(classesOf(screen.getByText('Ready offline'))).toContain(TONE[tone].ink);
      const fill = TONE[tone].fill;
      if (fill) expect(classesOf(chip())).toContain(fill);
      else expect(classesOf(chip()).some((name) => name.startsWith('bg-'))).toBe(false);
    },
  );

  test.each(TONES)('%s tints its icon from the same token as its text', async (tone) => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    await renderChip({ tone });
    expect(useThemeColor).toHaveBeenCalledWith(TONE[tone].token);
  });

  test('defaults to the muted tone', async () => {
    await renderChip();
    expect(classesOf(screen.getByText('Ready offline'))).toContain('text-muted');
  });

  test.each(TONES)(
    '%s keeps one border box whatever the tone, so a change of state moves no pixel',
    async (tone) => {
      await renderChip({ tone });
      expect(classesOf(chip())).toContain('border');
    },
  );

  test('a neutral chip is outlined in the border token; a soft one has no visible edge', async () => {
    await renderChip({ tone: 'muted' });
    expect(classesOf(chip())).toContain('border-border');

    await screen.rerender(
      <ToneChip label="Ready offline" icon={ICON} tone="danger" testID="state-chip" />,
    );
    expect(classesOf(chip())).toContain('border-transparent');
    expect(classesOf(chip())).not.toContain('border-border');
  });

  test.each(TONES)('%s never uses a 20% soft fill or a literal colour', async (tone) => {
    await renderChip({ tone });
    expect(String(chip().props.className)).not.toMatch(/\/20|soft|#[0-9a-f]{3,8}|rgb/i);
  });
});

describe('<ToneChip> layout - FR-029', () => {
  test('is a capsule that hugs its content and wraps its words instead of clipping them', async () => {
    await renderChip();
    expect(classesOf(chip())).toEqual(
      expect.arrayContaining(['flex-row', 'items-center', 'self-start', 'rounded-full']),
    );
    const words = screen.getByText('Ready offline');
    expect(classesOf(words)).toContain('shrink');
    expect(words.props.numberOfLines).toBeUndefined();
    expect(words.props.maxFontSizeMultiplier).toBeUndefined();
    expect(chip().props.style?.height).toBeUndefined();
  });
});
