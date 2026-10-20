/**
 * T520 - contract C5-16 (`SyncChip`), data-model section 8 (`SyncChipState`), FR-026,
 * FR-065, FR-029, FR-071; ONE per screen, at its top right.
 *
 * 36 dp, 92 percent paper with `lift1`: `waiting` a cloud-up glyph and the count; `syncing`
 * the spinner; `offline` a wifi-off glyph in `amberInk` and the count; `failed` a
 * `dangerTint` over the paper with a `danger` edge and the verb "Retry"; `synced` draws
 * nothing. Announced "3 changes waiting to sync" or "Sync failed, retry"; id `sync-chip`;
 * a 4 dp hit slop. The chip reads the state it is given and writes nothing.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { SyncChipState } from '@/features/sync/use-sync-chip-state';
import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';
import { useAppearance, type AppearanceContext } from '@/hooks/use-appearance';
import {
  FocusRing,
  PaletteNames,
  Palettes,
  liftOf,
  withAlpha,
  type PaletteName,
} from '@/theme';

import { glyphNamesIn, glyphsIn } from '../../../test/helpers/icons';
import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';

import { SyncChip } from './sync-chip';

jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-accessibility-flags');
const mockedAppearance = useAppearance as jest.MockedFunction<typeof useAppearance>;

function appearance(themeName: PaletteName): AppearanceContext {
  return {
    theme: themeName.startsWith('dark') ? 'dark' : 'light',
    themeName,
    prefersMoreContrast: themeName.endsWith('contrast'),
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: {} as AppearanceContext['tokens'],
    ready: true,
  };
}

beforeEach(() => {
  mockedAppearance.mockReturnValue(appearance('light'));
  (useAccessibilityFlags as jest.Mock).mockReturnValue({
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
  });
});
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;
const classesOf = (element: { props: { className?: unknown } }) =>
  String(element.props.className ?? '').split(/\s+/);
const chip = () => screen.getByTestId('sync-chip');

const waiting = (count: number): SyncChipState => ({ kind: 'waiting', count });
const renderChip = (state: SyncChipState, props: Record<string, unknown> = {}) =>
  render(<SyncChip state={state} {...props} />);

describe('<SyncChip> states - C5-16', () => {
  test('synced draws nothing at all', async () => {
    await renderChip({ kind: 'synced' });
    expect(screen.toJSON()).toBeNull();
  });

  test('waiting: the cloud-up glyph and the count, announced in words', async () => {
    await renderChip(waiting(3));
    expect(glyphNamesIn()).toEqual(['cloud-upload']);
    expect(screen.getByText('3')).toBeTruthy();
    expect(chip().props.accessibilityLabel).toBe('3 changes waiting to sync');
    expect(chip().props.accessibilityRole).toBe('text');
  });

  test('one change is "1 change", not "1 changes"', async () => {
    await renderChip(waiting(1));
    expect(chip().props.accessibilityLabel).toBe('1 change waiting to sync');
  });

  test('syncing: the spinner (hidden from assistive technology) and the count', async () => {
    await renderChip({ kind: 'syncing', count: 3 });
    expect(glyphsIn()).toHaveLength(0);
    const spinner = screen.getByTestId('sync-chip-spinner', hidden);
    expect(spinner.props.accessibilityElementsHidden).toBe(true);
    expect(chip().props.accessibilityLabel).toBe('Syncing 3 changes');
    expect(screen.getByText('3')).toBeTruthy();
  });

  test('offline: the wifi-off glyph and the count, with what it means', async () => {
    await renderChip({ kind: 'offline', count: 3 });
    expect(glyphNamesIn()).toEqual(['wifi-off']);
    expect(chip().props.accessibilityLabel).toBe('Offline, 3 changes waiting to sync');
    expect(screen.getByText('3')).toBeTruthy();
  });

  test('offline with nothing waiting says only that, and shows no count', async () => {
    await renderChip({ kind: 'offline', count: 0 });
    expect(chip().props.accessibilityLabel).toBe('Offline');
    expect(screen.queryByText('0')).toBeNull();
  });

  test('failed: the alert glyph and the verb "Retry", announced "Sync failed, retry"', async () => {
    await renderChip({ kind: 'failed', count: 2 }, { onRetry: jest.fn() });
    expect(glyphNamesIn()).toEqual(['alert']);
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(chip().props.accessibilityLabel).toBe('Sync failed, retry');
  });

  test('keeps its id on the one node a flow finds it by', async () => {
    await renderChip(waiting(3));
    expect(screen.getByLabelText('3 changes waiting to sync')).toBe(chip());
  });

  test.each([
    ['waiting', waiting(2), '2'],
    ['syncing', { kind: 'syncing', count: 2 } as const, '2'],
    ['offline', { kind: 'offline', count: 2 } as const, '2'],
  ])(
    '%s: the count is tabular, so the chip does not jitter as it counts down',
    async (_k, state, text) => {
      await renderChip(state);
      expect(flat(screen.getByText(text)).fontVariant).toEqual(
        expect.arrayContaining(['tabular-nums']),
      );
    },
  );
});

describe('<SyncChip> retry - the one pressable state', () => {
  test('failed with onRetry is a button that retries', async () => {
    const onRetry = jest.fn();
    await renderChip({ kind: 'failed', count: 2 }, { onRetry });
    expect(chip().props.accessibilityRole).toBe('button');
    await fireEvent.press(chip());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('failed without onRetry is a label, not a button that does nothing', async () => {
    await renderChip({ kind: 'failed', count: 2 });
    expect(chip().props.accessibilityRole).toBe('text');
    expect(chip().props.hitSlop).toBeUndefined();
  });

  test.each([
    ['waiting', waiting(2)],
    ['syncing', { kind: 'syncing', count: 2 } as const],
    ['offline', { kind: 'offline', count: 2 } as const],
  ])('%s is never a button, even with onRetry', async (_name, state) => {
    const onRetry = jest.fn();
    await renderChip(state, { onRetry });
    expect(chip().props.accessibilityRole).toBe('text');
    await fireEvent.press(chip());
    expect(onRetry).not.toHaveBeenCalled();
  });

  test('has a 4 dp hit slop when it can be pressed', async () => {
    await renderChip({ kind: 'failed', count: 2 }, { onRetry: jest.fn() });
    expect(chip().props.hitSlop).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
  });

  test('a focused retry draws the 2.5 dp ring 2 dp outside, in the focus colour', async () => {
    mockThemeColors('light');
    await renderChip({ kind: 'failed', count: 2 }, { onRetry: jest.fn() });
    expect(flat(chip()).outlineWidth).toBeUndefined();
    await fireEvent(chip(), 'focus');
    expect(flat(chip())).toMatchObject({
      outlineWidth: FocusRing.width,
      outlineOffset: FocusRing.offset,
      outlineColor: asCss(Palettes.light.focus),
    });
  });
});

describe.each(PaletteNames)('<SyncChip> look in %s - C5-16', (theme) => {
  const palette = Palettes[theme];
  beforeEach(() => {
    mockThemeColors(theme);
    mockedAppearance.mockReturnValue(appearance(theme));
  });

  test('is 92 percent paper with lift1, 36 dp at least', async () => {
    await renderChip(waiting(3));
    expect(String(flat(chip()).backgroundColor).toLowerCase()).toBe(
      withAlpha(palette.surface, 0.92).toLowerCase(),
    );
    expect(flat(chip()).boxShadow).toEqual(liftOf(theme, 'lift1'));
    expect(flat(chip()).minHeight).toBe(36);
    expect(flat(chip()).height).toBeUndefined();
  });

  test('waiting reads in the muted ink, offline in amberInk', async () => {
    await renderChip(waiting(3));
    expect(classesOf(screen.getByText('3'))).toContain('text-muted');
    expect(glyphsIn()[0]?.color).toBe(asCss(palette.muted));
    await renderChip({ kind: 'offline', count: 3 });
    expect(classesOf(screen.getByText('3'))).toContain('text-amber-ink');
    expect(glyphsIn()[0]?.color).toBe(asCss(palette.amberInk));
  });

  test('failed lays dangerTint over the paper, with a danger edge and danger words', async () => {
    await renderChip({ kind: 'failed', count: 2 }, { onRetry: jest.fn() });
    expect(flat(chip())).toMatchObject({
      borderColor: asCss(palette.danger),
      borderWidth: 1,
    });
    expect(String(flat(chip()).backgroundColor).toLowerCase()).toBe(
      withAlpha(palette.surface, 0.92).toLowerCase(),
    );
    expect(flat(screen.getByTestId('sync-chip-tint', hidden)).backgroundColor).toBe(
      asCss(palette.dangerTint),
    );
    expect(classesOf(screen.getByText('Retry'))).toContain('text-danger');
    expect(glyphsIn()[0]?.color).toBe(asCss(palette.danger));
  });
});

describe('<SyncChip> layout - FR-029, FR-074', () => {
  test('its words are capped at 1.3 like a pill, and wrap', async () => {
    await renderChip(waiting(3));
    expect(screen.getByText('3').props.maxFontSizeMultiplier).toBe(1.3);
  });

  test('queries nothing - it reflects state the caller owns (Principle II)', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('./sync-chip.tsx'), 'utf8') as string;
    expect(source).not.toMatch(/useQuery|fetch\(|axios|drizzle|expo-sqlite/);
  });
});
