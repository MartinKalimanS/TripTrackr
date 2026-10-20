/**
 * T421 and T520 - contract C11 (002) and C5-16 (`SyncBadge`), FR-007, FR-025, FR-029,
 * FR-030, FR-034, FR-065; review rules 3 and 5.
 *
 * What it announces and the ids it carries are stable (e2e flows and tests read them): a
 * text node named "Sync pending", "Sync in progress" or "Sync failed", its icon
 * `sync-badge-icon`, the visible words "Not yet synced", "Syncing", "Sync failed". Feature
 * 005 gives the chip the amber and danger tints with a DASHED edge (a shape and a glyph as
 * well as a hue), and a glyph-only form for a photograph: a 24 dp disc.
 */
import { render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { StyleSheet } from 'react-native';

import { PaletteNames, Palettes } from '@/theme';

import { glyphNamesIn, glyphsIn } from '../../../test/helpers/icons';
import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { SyncBadge, type SyncState } from './sync-badge';

afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const STATES = ['pending', 'syncing', 'failed'] as const;
const classesOf = (element: { props: { className?: unknown } }) =>
  String(element.props.className ?? '').split(/\s+/);
const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;
const badge = () => screen.getByLabelText(/sync/i);

describe('<SyncBadge> - contract C11', () => {
  test.each([
    ['pending', 'Not yet synced'],
    ['syncing', 'Syncing'],
    ['failed', 'Sync failed'],
  ] as const)('conveys %s with text, not colour alone (FR-025)', async (state, label) => {
    await render(<SyncBadge state={state} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  test.each([
    ['pending', 'Sync pending'],
    ['syncing', 'Sync in progress'],
    ['failed', 'Sync failed'],
  ] as const)(
    'announces %s as "%s", a text node, exactly as before (FR-030)',
    async (state, announce) => {
      await render(<SyncBadge state={state} />);
      expect(badge().props.accessibilityLabel).toBe(announce);
      expect(badge().props.accessibilityRole).toBe('text');
    },
  );

  test('carries an icon as well as the message, so state survives a glance', async () => {
    await render(<SyncBadge state="pending" />);
    expect(screen.getByTestId('sync-badge-icon', hidden)).toBeTruthy();
    expect(glyphsIn()).toHaveLength(1);
  });

  test('keeps the icon decorative: the badge itself carries the announcement', async () => {
    await render(<SyncBadge state="failed" />);
    expect(screen.getByTestId('sync-badge-icon', hidden).props.accessible).toBe(false);
  });

  test('distinguishes each state from the others by more than hue', async () => {
    await render(
      <>
        <SyncBadge state="pending" />
        <SyncBadge state="syncing" />
        <SyncBadge state="failed" />
      </>,
    );
    expect(glyphNamesIn()).toEqual(['clock', 'sync', 'alert']);
  });

  test('queries nothing - it reflects state the caller owns (Principle II)', () => {
    // The badge is a presentation of synchronisation state, never a participant
    // in it. Importing the sync layer here would invert that.
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('./sync-badge.tsx'), 'utf8') as string;
    expect(source).not.toMatch(/useQuery|fetch\(|axios|drizzle|expo-sqlite/);
  });
});

describe.each(PaletteNames)('<SyncBadge> look in %s - C5-16, FR-034', (theme) => {
  const palette = Palettes[theme];
  beforeEach(() => mockThemeColors(theme));

  test.each([
    ['pending', 'amberTint', 'amberLine', 'text-amber-ink'],
    ['syncing', 'amberTint', 'amberLine', 'text-amber-ink'],
    ['failed', 'dangerTint', 'danger', 'text-danger'],
  ] as const)(
    '%s: its tint, its dashed edge and its gated ink',
    async (state, fill, edge, ink) => {
      await render(<SyncBadge state={state} />);
      expect(flat(badge())).toMatchObject({
        backgroundColor: asCss(palette[fill]),
        borderColor: asCss(palette[edge]),
        borderStyle: 'dashed',
      });
      expect(classesOf(screen.getByText(/./))).toContain(ink);
    },
  );

  test('the icon takes the ink of the words', async () => {
    await render(<SyncBadge state="failed" />);
    expect(glyphsIn()[0]?.color).toBe(asCss(palette.danger));
    await render(<SyncBadge state="pending" />);
    expect(glyphsIn()[0]?.color).toBe(asCss(palette.amberInk));
  });
});

describe('<SyncBadge> as a chip - FR-029', () => {
  test.each(STATES)('%s is a capsule that hugs its content', async (state) => {
    await render(<SyncBadge state={state} />);
    expect(flat(badge())).toMatchObject({
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
    });
    expect(Number(flat(badge()).borderRadius)).toBeGreaterThanOrEqual(44);
  });

  test.each(STATES)(
    '%s never uses a 20% soft fill or a literal colour',
    async (state) => {
      await render(<SyncBadge state={state} />);
      expect(String(badge().props.className ?? '')).not.toMatch(
        /\/20|soft|#[0-9a-f]{3,8}|rgb/i,
      );
    },
  );

  test('text can grow with the text size: no fixed height, capped at 1.3 like a pill', async () => {
    await render(<SyncBadge state="pending" />);
    expect(flat(badge()).height).toBeUndefined();
    expect(screen.getByText('Not yet synced').props.maxFontSizeMultiplier).toBe(1.3);
  });

  test('asks the kit for its tint colour, as the same token as its text', async () => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    await render(<SyncBadge state="pending" />);
    expect(useThemeColor).toHaveBeenCalledWith('amber-ink');
  });
});

describe('<SyncBadge glyphOnly> on a photograph - C5-16', () => {
  const STATE_GLYPH: Record<SyncState, string> = {
    pending: 'clock',
    syncing: 'sync',
    failed: 'alert',
  };

  test.each(STATES)('%s draws only its glyph, inside a 24 dp disc', async (state) => {
    await render(<SyncBadge state={state} glyphOnly />);
    expect(screen.queryByText('Not yet synced')).toBeNull();
    expect(screen.queryByText('Syncing')).toBeNull();
    expect(screen.queryByText('Sync failed')).toBeNull();
    expect(glyphNamesIn()).toEqual([STATE_GLYPH[state]]);
    expect(flat(badge())).toMatchObject({ width: 24, height: 24 });
    expect(Number(flat(badge()).borderRadius)).toBeGreaterThanOrEqual(12);
  });

  test.each(STATES)('%s keeps its announcement, role and id', async (state) => {
    await render(<SyncBadge state={state} glyphOnly />);
    expect(badge().props.accessibilityRole).toBe('text');
    expect(['Sync pending', 'Sync in progress', 'Sync failed']).toContain(
      badge().props.accessibilityLabel,
    );
    expect(screen.getByTestId('sync-badge-icon', hidden)).toBeTruthy();
  });

  describe.each(PaletteNames)('in %s', (theme) => {
    const palette = Palettes[theme];
    beforeEach(() => mockThemeColors(theme));

    test.each(['pending', 'syncing'] as const)(
      '%s is the scrim disc with a white glyph',
      async (state) => {
        await render(<SyncBadge state={state} glyphOnly />);
        expect(flat(badge()).backgroundColor).toBe(asCss(palette.scrimButton));
        expect(glyphsIn()[0]?.color).toBe(asCss(palette.onPhoto));
      },
    );

    test('failed is a danger disc with the danger ink on it (P5)', async () => {
      await render(<SyncBadge state="failed" glyphOnly />);
      expect(flat(badge()).backgroundColor).toBe(asCss(palette.danger));
      expect(glyphsIn()[0]?.color).toBe(asCss(palette.dangerInk));
    });
  });
});
