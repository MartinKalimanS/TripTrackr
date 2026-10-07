/**
 * T066 - contract C11, FR-007; restyled for Atlas in T421 (contract C4-8, FR-025, FR-034).
 *
 * Constitution Principle II: a record must not be presented as saved before its
 * bytes have landed. A look made of "settled, finished" surfaces implies exactly that
 * unless something says otherwise, so the badge is a small chip with an icon AND words,
 * tinted `pending` (violet) or `danger`, and drawn dashed like every other pending marker.
 *
 * Jest renders the kit's text as plain host text that forwards every prop, so what is
 * asserted is the accessibility contract on the host nodes and the semantic classes the
 * badge ASKS for, never real styling (test/ui-kit/field-chip-real-render.test.tsx and the
 * contrast gate cover the rest).
 */
import { render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';

import { SyncBadge, type SyncState } from './sync-badge';

jest.mock('expo-symbols', () => {
  const { View } = require('react-native');
  return {
    SymbolView: (props: Record<string, unknown>) => <View testID="symbol" {...props} />,
  };
});

afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const STATES = ['pending', 'syncing', 'failed'] as const;
const classesOf = (element: { props: { className?: unknown } }) =>
  String(element.props.className ?? '').split(/\s+/);
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
    expect(screen.getAllByTestId('symbol', hidden)).toHaveLength(1);
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
    const names = screen
      .getAllByTestId('symbol', hidden)
      .map((node) => `${node.props.name.ios}/${node.props.name.android}`);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
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

describe('<SyncBadge> tint - FR-034, review rules 3 and 5', () => {
  const TINT: Record<SyncState, { ink: string; fill: string; token: string }> = {
    pending: { ink: 'text-pending', fill: 'bg-pending/15', token: 'pending' },
    syncing: { ink: 'text-pending', fill: 'bg-pending/15', token: 'pending' },
    failed: { ink: 'text-danger', fill: 'bg-danger/15', token: 'danger' },
  };

  test.each(STATES)('%s asks for its ink on its 15% soft fill', async (state) => {
    await render(<SyncBadge state={state} />);
    expect(classesOf(badge())).toContain(TINT[state].fill);
    expect(classesOf(screen.getByText(/./))).toContain(TINT[state].ink);
  });

  test.each(STATES)(
    '%s tints its icon from the same token as its text',
    async (state) => {
      const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
      await render(<SyncBadge state={state} />);
      expect(useThemeColor).toHaveBeenCalledWith(TINT[state].token);
    },
  );

  test.each(STATES)('%s is a chip: a row, a capsule, drawn dashed', async (state) => {
    await render(<SyncBadge state={state} />);
    expect(classesOf(badge())).toEqual(
      expect.arrayContaining([
        'flex-row',
        'items-center',
        'rounded-full',
        'border-dashed',
      ]),
    );
  });

  test.each(STATES)(
    '%s never uses a 20% soft fill or a literal colour',
    async (state) => {
      await render(<SyncBadge state={state} />);
      expect(String(badge().props.className)).not.toMatch(
        /\/20|soft|#[0-9a-f]{3,8}|rgb/i,
      );
    },
  );

  test('text can grow with the text size: no fixed height, no capped scaling', async () => {
    await render(<SyncBadge state="pending" />);
    expect(badge().props.style?.height).toBeUndefined();
    expect(
      screen.getByText('Not yet synced').props.maxFontSizeMultiplier,
    ).toBeUndefined();
  });
});
