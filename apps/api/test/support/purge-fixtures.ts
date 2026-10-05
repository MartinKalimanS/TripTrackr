import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';

import type { SyncTable } from '@triptrackr/contracts';

import { FOOD } from './expenses';
import { CITY } from './geography';

/**
 * Fixtures for the tombstone purge suites (tasks.md T129; migration 0013).
 *
 * Every row is inserted through the OWNER connection, because the point of the
 * purge is that nobody else can reach these rows, and every `deleted_at` is
 * written as `now() - <minutes>` so that its age is measured by the database's
 * clock — the clock the keyholes compare it with — and never by this machine's,
 * which a container's may disagree with by minutes.
 *
 * Each {@link PurgeFixtures.traveller} is a fresh account with a live trip of its
 * own: the purge acts on the whole database, so a test that shared accounts
 * would be counting other tests' leftovers.
 */

/** Minutes since a row was tombstoned; `null` is a live row. */
export type Age = number | null;

const DAY = 24 * 60;

export const AGES = {
  /** The retention window the protocol states (sync-protocol.md §5). */
  window: 90 * DAY,
  /** Long enough ago that the row is due whatever else is true. */
  old: 120 * DAY,
  /** Inside the window, comfortably. */
  young: 30 * DAY,
  /** Five minutes past the window: due, but only just. */
  justDue: 90 * DAY + 5,
  /** Five minutes short of the window: kept, but only just. */
  justShort: 90 * DAY - 5,
} as const;

export interface Traveller {
  readonly id: string;
  /** A live trip of theirs, for the rows that need a parent that stays. */
  readonly tripId: string;
}

/** A row that owns an object in a private bucket. */
export interface StoredObject {
  readonly id: string;
  readonly key: string;
}

function required<T>(row: T | undefined, what: string): T {
  if (row === undefined) throw new Error(`The ${what} fixture was not inserted.`);

  return row;
}

export class PurgeFixtures {
  private readonly userIds: string[] = [];
  private nextStop = 0;

  constructor(private readonly owner: Sql) {}

  private deletedAt(age: Age) {
    return age === null
      ? this.owner`NULL::timestamptz`
      : this.owner`now() - make_interval(mins => ${age})`;
  }

  async traveller(): Promise<Traveller> {
    const id = randomUUID();
    await this.owner`
      INSERT INTO users (id, email, display_name, password_hash, home_currency, is_profile_public)
      VALUES (${id}::uuid, ${`purge-${id}@example.test`}, 'Purge fixture',
              ${'$argon2id$seeded$notarealhash'}, 'CHF', false)
    `;
    this.userIds.push(id);

    return { id, tripId: await this.trip(id, null) };
  }

  async trip(userId: string, age: Age): Promise<string> {
    const [row] = await this.owner<{ id: string }[]>`
      INSERT INTO trips (owner_id, title, is_public, home_currency, status, deleted_at)
      VALUES (${userId}::uuid, 'Purge fixture trip', false, 'CHF', 'planning',
              ${this.deletedAt(age)})
      RETURNING id
    `;

    return required(row, 'trip').id;
  }

  async stop(tripId: string, age: Age): Promise<string> {
    const [row] = await this.owner<{ id: string }[]>`
      INSERT INTO trip_stops (trip_id, city_id, sort_order, arrive_date, depart_date,
                              deleted_at)
      VALUES (${tripId}::uuid, ${CITY.zurich}, ${this.nextStop++}, '2026-06-01',
              '2026-06-08', ${this.deletedAt(age)})
      RETURNING id
    `;

    return required(row, 'trip stop').id;
  }

  async note(tripId: string, age: Age): Promise<string> {
    const [row] = await this.owner<{ id: string }[]>`
      INSERT INTO notes (trip_id, city_id, body, deleted_at)
      VALUES (${tripId}::uuid, ${CITY.zurich}, 'Purge fixture note', ${this.deletedAt(age)})
      RETURNING id
    `;

    return required(row, 'note').id;
  }

  async expense(tripId: string, age: Age, categoryId: string = FOOD): Promise<string> {
    const [row] = await this.owner<{ id: string }[]>`
      INSERT INTO expenses (trip_id, category_id, amount, currency, spent_at, deleted_at)
      VALUES (${tripId}::uuid, ${categoryId}::uuid, '12.50', 'CHF', '2026-06-02',
              ${this.deletedAt(age)})
      RETURNING id
    `;

    return required(row, 'expense').id;
  }

  async category(userId: string, age: Age): Promise<string> {
    const [row] = await this.owner<{ id: string }[]>`
      INSERT INTO expense_categories (user_id, name, deleted_at)
      VALUES (${userId}::uuid, ${`Purge fixture ${randomUUID()}`}, ${this.deletedAt(age)})
      RETURNING id
    `;

    return required(row, 'category').id;
  }

  /** A photo; `recordedThumb` says the media worker had already filed its thumbnail key. */
  async photo(tripId: string, age: Age, recordedThumb = false): Promise<StoredObject> {
    const key = `${randomUUID()}/${randomUUID()}`;
    const [row] = await this.owner<{ id: string }[]>`
      INSERT INTO photos (trip_id, storage_key, thumb_key, upload_state, deleted_at)
      VALUES (${tripId}::uuid, ${key}, ${recordedThumb ? `${key}.thumb.jpg` : null},
              'uploaded', ${this.deletedAt(age)})
      RETURNING id
    `;

    return { id: required(row, 'photo').id, key };
  }

  async document(tripId: string, age: Age): Promise<StoredObject> {
    const key = `${randomUUID()}/${randomUUID()}`;
    const [row] = await this.owner<{ id: string }[]>`
      INSERT INTO documents (trip_id, type, storage_key, content_type, byte_size,
                             wrapped_dek, dek_key_id, upload_state, deleted_at)
      VALUES (${tripId}::uuid, 'other', ${key}, 'image/jpeg', 2048,
              ${Buffer.alloc(60, 1)}, 'v1', 'uploaded', ${this.deletedAt(age)})
      RETURNING id
    `;

    return { id: required(row, 'document').id, key };
  }

  /** A planner row, which has no tombstone of its own and goes with its trip. */
  async itineraryDay(tripId: string): Promise<string> {
    const [row] = await this.owner<{ id: string }[]>`
      INSERT INTO itinerary_days (trip_id, city_id, day_date)
      VALUES (${tripId}::uuid, ${CITY.zurich}, '2026-06-03')
      RETURNING id
    `;

    return required(row, 'itinerary day').id;
  }

  /** Re-dates a tombstone — as the passing of time would. `table` is one of the seven, never input. */
  async setAge(table: SyncTable, id: string, age: Age): Promise<void> {
    if (age === null) {
      await this.owner.unsafe(
        `UPDATE ${table} SET deleted_at = NULL WHERE id = $1::uuid`,
        [id],
      );
      return;
    }

    await this.owner.unsafe(
      `UPDATE ${table} SET deleted_at = now() - make_interval(mins => $2::int)
       WHERE id = $1::uuid`,
      [id, age],
    );
  }

  /** Whether the row is still stored — tombstone or not. */
  async present(table: SyncTable, id: string): Promise<boolean> {
    const rows = await this.owner.unsafe(`SELECT 1 FROM ${table} WHERE id = $1::uuid`, [
      id,
    ]);

    return rows.length > 0;
  }

  /** Removes every account this instance made, and with them everything they own. */
  async cleanUp(): Promise<void> {
    if (this.userIds.length === 0) return;

    await this.owner`DELETE FROM users WHERE id = ANY(${this.userIds}::uuid[])`;
    this.userIds.length = 0;
  }
}
