import { HttpException, HttpStatus } from '@nestjs/common';
import {
  CreateExpenseCategoryRequest,
  ExpenseCategory,
  SYSTEM_EXPENSE_CATEGORIES,
} from '@triptrackr/contracts';

import { CategoriesService } from '@/modules/expenses/categories.service';
import type {
  CategoryRow,
  ExpensesRepository,
} from '@/modules/expenses/expenses.repository';

/**
 * Expense categories (rest-api.md §7; FR-023, FR-024; research D-29; tasks.md T080),
 * against a stubbed repository.
 *
 * FR-024 makes a custom category the traveller's, reusable across every trip, and the
 * service refuses to make the same one twice: a replayed create by id (research D-15),
 * the same name again in any case, and a parallel create that wins the race by name all
 * hand back the existing row. An id that is not the caller's to reuse — a system row's
 * (the six seeded with the contract's fixed ids, migration 0009) or another traveller's,
 * which the policy hides — is never handed back as theirs: it is one identical 409
 * `CATEGORY_ID_UNAVAILABLE` that does not say which (contracts/README.md rule 1).
 */

const USER_ID = '11111111-1111-4111-8111-111111111111';
const COFFEE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NEW_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FOREIGN_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const GENERATED_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOOD = SYSTEM_EXPENSE_CATEGORIES[0].id;
const STAMP = new Date('2026-06-02T08:00:00.000Z');

/** The six seeded rows: no owner, the contract's fixed ids, in their fixed order. */
const SYSTEM_ROWS: readonly CategoryRow[] = SYSTEM_EXPENSE_CATEGORIES.map((category) => ({
  id: category.id,
  userId: null,
  name: category.name,
  icon: category.icon,
  createdAt: STAMP,
  updatedAt: STAMP,
}));

function ownCategory(id: string, name: string, icon: string | null = null): CategoryRow {
  return { id, userId: USER_ID, name, icon, createdAt: STAMP, updatedAt: STAMP };
}

interface World {
  /** The caller's own live categories; the system six are always visible. */
  readonly own?: readonly CategoryRow[];
  /** Ids held by categories the policy hides: another traveller's. */
  readonly hiddenIds?: readonly string[];
  /** A row a parallel request commits under the same name just before this insert. */
  readonly racedBy?: CategoryRow;
}

/**
 * The repository over a small world. `insertCategory` is `ON CONFLICT DO NOTHING` over the
 * primary key and `UNIQUE (user_id, name)`; the name lookup is `lower(name) = lower($1)`.
 */
function stubRepository(world: World) {
  const visible = new Map(
    [...SYSTEM_ROWS, ...(world.own ?? [])].map((row) => [row.id, row]),
  );
  const taken = new Set([...visible.keys(), ...(world.hiddenIds ?? [])]);
  const own = () => [...visible.values()].filter((row) => row.userId === USER_ID);
  const ownByName = (name: string) =>
    own().find((row) => row.name.toLowerCase() === name.toLowerCase()) ?? null;

  return {
    listCategories: jest.fn(() => Promise.resolve([...visible.values()])),
    findCategory: jest.fn((id: string) => Promise.resolve(visible.get(id) ?? null)),
    findOwnCategoryByName: jest.fn((name: string) => Promise.resolve(ownByName(name))),
    insertCategory: jest.fn(
      (category: { id?: string; name: string; icon: string | null }) => {
        if (world.racedBy) visible.set(world.racedBy.id, world.racedBy);
        const conflict =
          (category.id !== undefined && taken.has(category.id)) ||
          own().some((row) => row.name === category.name);

        return Promise.resolve(
          conflict
            ? null
            : ownCategory(category.id ?? GENERATED_ID, category.name, category.icon),
        );
      },
    ),
  };
}

function harness(world: World = {}) {
  const repository = stubRepository(world);
  const service = new CategoriesService(repository as unknown as ExpensesRepository);

  return { service, repository };
}

/** A create exactly as the validation pipe hands it over: parsed, defaults applied. */
function createRequest(input: {
  id?: string;
  name: string;
  icon?: string | null;
}): CreateExpenseCategoryRequest {
  return CreateExpenseCategoryRequest.parse(input);
}

/** The HttpException a call was refused with; a call that succeeds fails the test. */
async function refusal(
  call: Promise<unknown>,
): Promise<{ status: number; body: unknown }> {
  const outcome: unknown = await call.then(
    () => new Error('Expected a refusal, but the call succeeded.'),
    (error: unknown) => error,
  );
  if (!(outcome instanceof HttpException)) throw outcome;

  return { status: outcome.getStatus(), body: outcome.getResponse() };
}

describe('CategoriesService.create — the same category is never made twice (FR-024)', () => {
  it("hands back the caller's own category for a replayed id, even when the name was retyped (research D-15)", async () => {
    const { service, repository } = harness({
      own: [ownCategory(COFFEE_ID, 'Coffee', 'cup')],
    });

    const replay = await service.create(
      createRequest({ id: COFFEE_ID, name: 'Coffee & cake' }),
    );

    expect(replay).toEqual({
      id: COFFEE_ID,
      user_id: USER_ID,
      name: 'Coffee',
      icon: 'cup',
      created_at: '2026-06-02T08:00:00.000Z',
      updated_at: '2026-06-02T08:00:00.000Z',
    });
    expect(repository.insertCategory).not.toHaveBeenCalled();
  });

  it('hands back the existing row when the caller already has the name, in any case', async () => {
    const { service, repository } = harness({ own: [ownCategory(COFFEE_ID, 'Coffee')] });

    const again = await service.create(createRequest({ name: 'coffee' }));

    expect(again).toMatchObject({ id: COFFEE_ID, user_id: USER_ID, name: 'Coffee' });
    expect(repository.insertCategory).not.toHaveBeenCalled();
  });

  it('hands back the winner when a parallel create of the same name commits first', async () => {
    // Arrange — both lookups ran before the other request committed; the insert
    // then meets UNIQUE (user_id, name) and returns nothing.
    const { service } = harness({ racedBy: ownCategory(COFFEE_ID, 'Coffee') });

    // Act
    const outcome = await service.create(createRequest({ id: NEW_ID, name: 'Coffee' }));

    // Assert — the one category that exists, not a refusal and not a second row.
    expect(outcome).toMatchObject({ id: COFFEE_ID, user_id: USER_ID, name: 'Coffee' });
  });

  it('creates a new category owned by the caller, under the client id, with its icon', async () => {
    const { service } = harness();

    const created = await service.create(
      createRequest({ id: NEW_ID, name: 'Coffee', icon: 'cup' }),
    );

    expect(created).toMatchObject({
      id: NEW_ID,
      user_id: USER_ID,
      name: 'Coffee',
      icon: 'cup',
    });
    expect(ExpenseCategory.safeParse(created).success).toBe(true);
  });
});

describe("CategoriesService.create — an id that is not the caller's to reuse", () => {
  it("refuses a system row's id and another traveller's id with one identical 409, handing back neither", async () => {
    // Arrange — FOOD is visible to everyone but owned by no one; FOREIGN_ID is
    // someone else's category, which the policy hides entirely.
    const system = harness();
    const foreign = harness({ hiddenIds: [FOREIGN_ID] });

    // Act
    const systemId = await refusal(
      system.service.create(createRequest({ id: FOOD, name: 'Groceries' })),
    );
    const foreignId = await refusal(
      foreign.service.create(createRequest({ id: FOREIGN_ID, name: 'Groceries' })),
    );

    // Assert
    expect(systemId).toEqual({
      status: HttpStatus.CONFLICT,
      body: {
        error: {
          code: 'CATEGORY_ID_UNAVAILABLE',
          message: 'That category id is already in use. Please retry with a new id.',
        },
      },
    });
    expect(foreignId).toEqual(systemId);
  });
});

describe('CategoriesService.list', () => {
  it("returns the system six with user_id null ahead of the caller's own, in the repository's order (research D-29)", async () => {
    const { service } = harness({ own: [ownCategory(COFFEE_ID, 'Coffee')] });

    const categories = await service.list();

    expect(categories.map((category) => [category.id, category.user_id])).toEqual([
      ...SYSTEM_EXPENSE_CATEGORIES.map((category) => [category.id, null]),
      [COFFEE_ID, USER_ID],
    ]);
    expect(
      categories.every((category) => ExpenseCategory.safeParse(category).success),
    ).toBe(true);
  });
});
