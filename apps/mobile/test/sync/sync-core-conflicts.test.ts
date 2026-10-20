/**
 * T133 — deciding when there is something to tell the traveller (FR-040):
 * a notice only when the overwritten content actually differed, and the
 * store the conflict-notice component reads.
 */
import { renderHook, act } from '@testing-library/react-native';

import type { SyncRow } from '@/db/repositories/sync';
import {
  contentDiffers,
  noticeForOverwrite,
  raiseConflicts,
  useConflictNotices,
  useConflictStore,
} from '@/sync/conflicts';

import { TRIP, at, uuid, wire } from './sync-core-fixtures';

beforeEach(() => {
  useConflictStore.getState().clear();
});

function local(
  table: Parameters<typeof wire>[0],
  overrides: Record<string, unknown> = {},
): SyncRow {
  return {
    ...wire(table, uuid(4)),
    is_dirty: true,
    synced_at: null,
    ...overrides,
  } as SyncRow;
}

describe('contentDiffers', () => {
  test('is false for two versions that read the same', () => {
    expect(contentDiffers('notes', local('notes'), wire('notes', uuid(4)))).toBe(false);
  });

  test.each([
    ['title', { title: 'Different' }],
    ['body', { body: 'Different' }],
    ['country_id', { country_id: 2 }],
    ['is_public', { is_public: true }],
    ['trip_id', { trip_id: uuid(8) }],
  ])('is true when %s differs', (_field, change) => {
    expect(contentDiffers('notes', local('notes'), wire('notes', uuid(4), change))).toBe(
      true,
    );
  });

  test('ignores timestamps, local-only columns and server-owned columns', () => {
    const incoming = wire('trips', TRIP, {
      created_at: at(40),
      updated_at: at(50),
      status: 'past',
    });
    const mine = local('trips', { is_dirty: true, synced_at: at(2), status: 'planning' });
    expect(contentDiffers('trips', mine, incoming)).toBe(false);
  });

  test('ignores the derived FX columns of an expense but not its amount', () => {
    const mine = local('expenses', { fx_rate_to_home: null, amount_home: null });
    const backfilled = wire('expenses', uuid(4), {
      fx_rate_to_home: '0.920000',
      amount_home: '11.50',
      fx_pending: false,
    });
    expect(contentDiffers('expenses', mine, backfilled)).toBe(false);
    expect(contentDiffers('expenses', mine, { ...backfilled, amount: '13.00' })).toBe(
      true,
    );
  });

  test('12.5 and 12.50 are the same amount', () => {
    expect(
      contentDiffers(
        'expenses',
        local('expenses', { amount: '12.5' }),
        wire('expenses', uuid(4), { amount: '12.50' }),
      ),
    ).toBe(false);
  });

  test('an unparseable amount falls back to text comparison rather than throwing', () => {
    expect(
      contentDiffers(
        'expenses',
        local('expenses', { amount: 'abc' }),
        wire('expenses', uuid(4), { amount: 'abc' }),
      ),
    ).toBe(false);
    expect(
      contentDiffers(
        'expenses',
        local('expenses', { amount: 'abc' }),
        wire('expenses', uuid(4), { amount: '1.00' }),
      ),
    ).toBe(true);
  });

  test('surrounding whitespace is not content', () => {
    expect(
      contentDiffers(
        'trips',
        local('trips', { title: ' Italy ' }),
        wire('trips', uuid(4), { title: 'Italy' }),
      ),
    ).toBe(false);
  });

  test('an object column compares by content, not by key order', () => {
    const parsed = {
      flight_number: 'AC834',
      flight_date: '2026-09-02',
      passenger_name: 'ANA',
    };
    const reordered = {
      passenger_name: 'ANA',
      flight_date: '2026-09-02',
      flight_number: 'AC834',
    };
    expect(
      contentDiffers(
        'documents',
        local('documents', { parsed_json: parsed }),
        wire('documents', uuid(4), { parsed_json: reordered }),
      ),
    ).toBe(false);
    expect(
      contentDiffers(
        'documents',
        local('documents', { parsed_json: parsed }),
        wire('documents', uuid(4), { parsed_json: { ...parsed, passenger_name: 'BOB' } }),
      ),
    ).toBe(true);
    expect(
      contentDiffers(
        'documents',
        local('documents', { parsed_json: parsed }),
        wire('documents', uuid(4), { parsed_json: null }),
      ),
    ).toBe(true);
  });

  test('a deletion on either side is a difference; two deletions are not', () => {
    const live = wire('notes', uuid(4));
    const dead = wire('notes', uuid(4), { deleted_at: at(9) });
    expect(contentDiffers('notes', local('notes', { deleted_at: at(5) }), live)).toBe(
      true,
    );
    expect(contentDiffers('notes', local('notes'), dead)).toBe(true);
    expect(contentDiffers('notes', local('notes', { deleted_at: at(5) }), dead)).toBe(
      false,
    );
  });
});

describe('noticeForOverwrite', () => {
  test('is null when nothing the traveller wrote differed', () => {
    expect(
      noticeForOverwrite('notes', local('notes'), wire('notes', uuid(4)), at(20)),
    ).toBeNull();
  });

  test('describes a replaced edit in the traveller’s words, with a link to the trip', () => {
    const notice = noticeForOverwrite(
      'notes',
      local('notes', { title: 'My Lisbon' }),
      wire('notes', uuid(4), { updated_at: at(8), title: 'Their Lisbon' }),
      at(20),
    );
    expect(notice).toEqual({
      id: `notes:${uuid(4)}:${at(8)}`,
      table: 'notes',
      recordId: uuid(4),
      tripId: TRIP,
      summary:
        'Your change to the note “My Lisbon” was replaced by a newer version saved on another device.',
      detectedAt: at(20),
    });
  });

  test('describes a local delete that lost', () => {
    const notice = noticeForOverwrite(
      'notes',
      local('notes', { deleted_at: at(5) }),
      wire('notes', uuid(4), { title: 'Lisbon' }),
      at(20),
    );
    expect(notice?.summary).toBe(
      'You deleted the note “Lisbon”, but a newer edit made on another device kept it.',
    );
  });

  test('describes an edit that lost to a remote delete', () => {
    const notice = noticeForOverwrite(
      'trips',
      local('trips', { title: 'Italy' }),
      wire('trips', TRIP, { deleted_at: at(9) }),
      at(20),
    );
    expect(notice?.summary).toBe(
      'The trip “Italy” was deleted on another device after your change, so it was removed here.',
    );
  });

  test('a trip is linked to itself and a category to no trip', () => {
    expect(
      noticeForOverwrite(
        'trips',
        local('trips', { title: 'Mine' }),
        wire('trips', TRIP, { title: 'Theirs' }),
        at(20),
      )?.tripId,
    ).toBe(TRIP);
    expect(
      noticeForOverwrite(
        'expense_categories',
        local('expense_categories', { name: 'Mine' }),
        wire('expense_categories', uuid(4), { name: 'Theirs' }),
        at(20),
      )?.tripId,
    ).toBeNull();
  });

  test('the same overwrite yields the same id, so it raises one notice', () => {
    const incoming = wire('notes', uuid(4), { title: 'Theirs', updated_at: at(8) });
    const a = noticeForOverwrite('notes', local('notes'), incoming, at(20));
    const b = noticeForOverwrite('notes', local('notes'), incoming, at(21));
    expect(a?.id).toBe(b?.id);
    raiseConflicts([a!, b!]);
    expect(useConflictStore.getState().notices).toHaveLength(1);
  });
});

describe('the conflict store', () => {
  const notice = (id: string) => ({
    id,
    table: 'notes' as const,
    recordId: uuid(4),
    tripId: TRIP,
    summary: id,
    detectedAt: at(1),
  });

  test('raises, ignores a duplicate id, dismisses one and clears all', () => {
    const { raise, dismiss, clear } = useConflictStore.getState();
    raise(notice('a'));
    raise(notice('a'));
    raise(notice('b'));
    expect(useConflictStore.getState().notices.map((n) => n.id)).toEqual(['a', 'b']);
    dismiss('a');
    expect(useConflictStore.getState().notices.map((n) => n.id)).toEqual(['b']);
    clear();
    expect(useConflictStore.getState().notices).toEqual([]);
  });

  test('raiseConflicts raises every notice in order', () => {
    raiseConflicts([notice('a'), notice('b')]);
    expect(useConflictStore.getState().notices.map((n) => n.id)).toEqual(['a', 'b']);
  });

  test('useConflictNotices follows the store', async () => {
    const { result } = await renderHook(() => useConflictNotices());
    expect(result.current).toEqual([]);
    await act(async () => raiseConflicts([notice('a')]));
    expect(result.current.map((n) => n.id)).toEqual(['a']);
  });
});
