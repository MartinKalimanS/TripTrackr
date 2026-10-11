/**
 * T430 - the trip card (contract C4-11 "Trip card"; FR-011, FR-012, FR-024, FR-029,
 * FR-030, FR-034, FR-037; research D4-09).
 *
 * One pressable `Card` (role button, one accessible name) with a cover band on top, then
 * the title, the status chip with the date range, the stops-and-currency line and the
 * pending badge. What is asserted is the accessibility contract (name, hint, role, ids
 * that existed before this feature), the content, the cover rule and its fallback, and the
 * semantic classes: never a pixel, never a colour.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TripCard } from '@/components/trip/trip-card';
import type { TripSummary } from '@/features/trips/use-trips';

import { analyseSources } from '../../scripts/lib/extract-ids';

// A View that carries every prop, so a test reads `source`, `recyclingKey` and fires `error`.
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});

const hidden = { includeHiddenElements: true };

function summary(
  overrides: Omit<Partial<TripSummary>, 'trip'> & {
    trip?: Partial<TripSummary['trip']>;
  } = {},
): TripSummary {
  const { trip, ...rest } = overrides;
  const status = rest.status ?? 'planning';
  return {
    trip: {
      id: 't1',
      title: 'Italy, spring 2026',
      home_currency: 'EUR',
      is_public: false,
      cover_photo_id: null,
      status: 'planning',
      created_at: 'x',
      updated_at: 'x',
      deleted_at: null,
      is_dirty: false,
      synced_at: 'x',
      ...trip,
    },
    stopCount: 2,
    status,
    cover: { kind: 'typographic', initial: 'I', status },
    dateRange: { start: '2026-03-12', end: '2026-03-20' },
    ...rest,
  };
}

async function renderCard(value: TripSummary, onPress = jest.fn()) {
  await render(<TripCard summary={value} onPress={onPress} />);
  return onPress;
}

const classes = (node: { props: Record<string, unknown> }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

describe('<TripCard> - one control, as before (FR-030, FR-037)', () => {
  test('is ONE button named "title, status, stops", with the hint and the id it always had', async () => {
    const onPress = await renderCard(summary({ status: 'active' }));

    const card = screen.getByTestId('trip-card-t1');
    expect(card.props.accessibilityLabel).toBe('Italy, spring 2026, active, 2 stops');
    expect(card.props.accessibilityHint).toBe('Opens the trip');
    expect(card.props.accessibilityRole).toBe('button');

    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test.each([
    [0, 'No stops yet'],
    [1, '1 stop'],
    [5, '5 stops'],
  ])('names %i stops as "%s"', async (stopCount, words) => {
    await renderCard(summary({ stopCount, status: 'past' }));
    expect(screen.getByTestId('trip-card-t1').props.accessibilityLabel).toBe(
      `Italy, spring 2026, past, ${words}`,
    );
  });

  test('has no other control inside it: nothing nests, nothing else is focusable', async () => {
    await renderCard(summary({ trip: { is_dirty: true } }));
    expect(screen.getAllByRole('button', hidden)).toHaveLength(1);
  });

  test('names its chevron cue (FR-024) and hides it from assistive technology', async () => {
    await renderCard(summary());
    const cue = screen.getByTestId('trip-card-t1-cue', hidden);
    expect(cue.props.accessibilityElementsHidden).toBe(true);
  });
});

describe('<TripCard> - what it shows (FR-011)', () => {
  test('the title, the status as text and icon, the range, the stops and the currency', async () => {
    await renderCard(summary({ status: 'active', stopCount: 3 }));

    expect(screen.getByText('Italy, spring 2026')).toBeTruthy();
    // The kept id and name of the status marker.
    expect(screen.getByTestId('status-pill-active')).toBeTruthy();
    expect(screen.getByLabelText('Status: Active', hidden)).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('12 Mar – 20 Mar 2026')).toBeTruthy();
    expect(screen.getByText('3 stops · EUR')).toBeTruthy();
  });

  test('says nothing about dates for a trip with no stop', async () => {
    await renderCard(summary({ dateRange: null, stopCount: 0 }));
    expect(screen.queryByText(/–/)).toBeNull();
    expect(screen.getByText('No stops yet · EUR')).toBeTruthy();
  });

  test.each([
    ['garbage', { start: 'garbage', end: '2026-03-20' }],
    ['empty', { start: '', end: '' }],
    ['reversed', { start: '2026-03-20', end: '2026-03-12' }],
  ])(
    'a %s range shows no date text and the rest of the card as usual',
    async (_name, dateRange) => {
      await renderCard(summary({ dateRange, status: 'active' }));

      expect(screen.queryByText(/–/)).toBeNull();
      expect(screen.getByText('Italy, spring 2026')).toBeTruthy();
      expect(screen.getByTestId('status-pill-active')).toBeTruthy();
      expect(screen.getByText('2 stops · EUR')).toBeTruthy();
      expect(screen.getByTestId('trip-card-t1').props.accessibilityLabel).toBe(
        'Italy, spring 2026, active, 2 stops',
      );
    },
  );

  test('shows the pending badge exactly when the row is dirty (Constitution II)', async () => {
    await renderCard(summary({ trip: { is_dirty: true } }));
    expect(screen.getByLabelText('Sync pending', hidden)).toBeTruthy();
    expect(screen.getByText('Not yet synced')).toBeTruthy();

    await renderCard(summary({ trip: { id: 't2', is_dirty: false } }));
    const clean = screen.getByTestId('trip-card-t2');
    expect(within(clean).queryByLabelText('Sync pending', hidden)).toBeNull();
  });

  test('the title is not announced as a heading: the card is the one element', async () => {
    await renderCard(summary());
    expect(screen.getByText('Italy, spring 2026').props.accessibilityRole).toBe('text');
  });
});

describe('<TripCard> - the cover (FR-012; research D4-09)', () => {
  const photo = (uri = 'file:///docs/photos/thumbs/p1.jpg'): TripSummary['cover'] => ({
    kind: 'photo',
    photoId: 'p1',
    thumbnailUri: uri,
  });

  test('a photo cover draws the thumbnail only, recycled by photo id, decorative', async () => {
    await renderCard(summary({ cover: photo() }));

    const image = screen.getByTestId('trip-card-t1-photo', hidden);
    expect(image.props.source).toEqual({ uri: 'file:///docs/photos/thumbs/p1.jpg' });
    expect(image.props.recyclingKey).toBe('p1');
    expect(image.props.contentFit).toBe('cover');
    expect(image.props.transition).toBe(0);
    expect(image.props.accessibilityElementsHidden).toBe(true);
    expect(screen.queryByTestId('trip-card-t1-initial', hidden)).toBeNull();
  });

  test('a photo that will not draw falls back to the typographic cover, deterministically', async () => {
    await renderCard(summary({ cover: photo() }));
    await fireEvent(screen.getByTestId('trip-card-t1-photo', hidden), 'error', {
      error: 'decode failed',
    });

    expect(screen.queryByTestId('trip-card-t1-photo', hidden)).toBeNull();
    // The initial of the TITLE and the trip's status, as the rule would have given it.
    expect(screen.getByTestId('trip-card-t1-initial', hidden)).toHaveTextContent('I');
  });

  test('the fallback is for that thumbnail only: another photo is tried afresh', async () => {
    const value = summary({ cover: photo() });
    const { rerender } = await render(<TripCard summary={value} onPress={jest.fn()} />);
    await fireEvent(screen.getByTestId('trip-card-t1-photo', hidden), 'error', {});
    expect(screen.queryByTestId('trip-card-t1-photo', hidden)).toBeNull();

    await rerender(
      <TripCard
        summary={{
          ...value,
          cover: { kind: 'photo', photoId: 'p2', thumbnailUri: 'file:///thumbs/p2.jpg' },
        }}
        onPress={jest.fn()}
      />,
    );
    const image = screen.getByTestId('trip-card-t1-photo', hidden);
    expect(image.props.source).toEqual({ uri: 'file:///thumbs/p2.jpg' });
    expect(image.props.recyclingKey).toBe('p2');
  });

  test.each([
    ['planning', 'bg-status-planning-ink/15', 'text-status-planning-ink'],
    ['active', 'bg-status-active/15', 'text-status-active'],
    ['past', 'bg-status-past/15', 'text-status-past'],
  ] as const)(
    'a typographic %s cover is a flat block tinted %s with a big initial in %s',
    async (status, fill, ink) => {
      await renderCard(
        summary({ status, cover: { kind: 'typographic', initial: 'L', status } }),
      );

      const band = screen.getByTestId('trip-card-t1-cover', hidden);
      expect(classes(band)).toEqual(expect.arrayContaining([fill]));
      const initial = screen.getByTestId('trip-card-t1-initial', hidden);
      expect(initial).toHaveTextContent('L');
      expect(classes(initial)).toEqual(expect.arrayContaining([ink]));
      // The display face, large.
      expect(classes(initial)).toContain('font-display-bold');
      expect(screen.queryByTestId('trip-card-t1-photo', hidden)).toBeNull();
    },
  );

  test('the cover is decorative: hidden from assistive technology on both platforms', async () => {
    await renderCard(summary());
    const band = screen.getByTestId('trip-card-t1-cover', hidden);
    expect(band.props.accessibilityElementsHidden).toBe(true);
    expect(band.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('the band runs to the card edge over the surface padding and keeps a minimum height', async () => {
    await renderCard(summary());
    const band = classes(screen.getByTestId('trip-card-t1-cover', hidden));
    expect(band).toEqual(expect.arrayContaining(['-mx-4', '-mt-4']));
    expect(band).toContain('min-h-[120px]');
  });
});

describe('<TripCard> - the largest text size (FR-029)', () => {
  test('rows wrap and nothing has a fixed height or a line limit', async () => {
    await renderCard(summary({ trip: { is_dirty: true } }));

    for (const row of ['status-row', 'meta-row']) {
      expect(classes(screen.getByTestId(`trip-card-t1-${row}`, hidden))).toContain(
        'flex-wrap',
      );
    }
    expect(screen.getByText('Italy, spring 2026').props.numberOfLines).toBeUndefined();
  });
});

describe('<TripCard> - sources (FR-036)', () => {
  const source = (file: string) =>
    readFileSync(path.resolve(__dirname, '..', '..', 'src', file), 'utf8');

  const FILES = ['components/trip/trip-card.tsx', 'components/trip/trip-cover-band.tsx'];
  const importsOf = (text: string) =>
    [...text.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

  test.each(FILES)('%s imports none of the retired primitives', (file) => {
    const specifiers = importsOf(source(file));
    expect(specifiers).not.toContain('@/components/ui/surface');
    expect(specifiers).not.toContain('@/components/ui/pressable-surface');
    expect(specifiers).not.toContain('@/components/themed-text');
    expect(specifiers).not.toContain('@/components/themed-view');
  });

  test.each(FILES)('%s has no colour literal and imports no kit', (file) => {
    const text = source(file);
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|\[#/);
    expect(importsOf(text).some((from) => /^(heroui-native|uniwind)/.test(from))).toBe(
      false,
    );
  });

  // The id parity guard reads ids out of the source. An id handed in as a prop is one it
  // cannot read where it is used, and each is a blind spot the ratchet then allows: the
  // card and its cover band write every id out, with the literal head `trip-card-`.
  test('every id the card and the band build is readable by the id extractor', () => {
    const { ids, unresolved } = analyseSources(
      FILES.map((file) => ({ path: `src/${file}`, text: source(file) })),
    );

    expect(unresolved.testIDs).toEqual([]);
    expect(ids.testIDs).toEqual(
      expect.arrayContaining([
        'trip-card-<param>',
        'trip-card-<param>-cover',
        'trip-card-<param>-photo',
        'trip-card-<param>-initial',
        'trip-card-<param>-cue',
        'trip-card-<param>-status-row',
        'trip-card-<param>-meta-row',
      ]),
    );
  });
});
