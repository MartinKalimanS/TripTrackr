import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateExpenseCategoryRequest,
  ExpenseCategory,
} from '@triptrackr/contracts';

import { apiError } from '@/common/errors/api-error';

import { ExpensesRepository, type CategoryRow } from './expenses.repository';

/**
 * Expense categories (rest-api.md §7; FR-023, FR-024; research D-29).
 *
 * The six system rows are seeded by migration 0009 with the ids the contract
 * publishes; they are read-only for every traveller (0007 §5). A custom
 * category is scoped to the traveller, not the trip, so it is reusable across
 * every trip they own (FR-024) — and creating one that already exists by name
 * hands back the existing row, because two "Coffee" categories is a mistake
 * nobody intends.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly repository: ExpensesRepository) {}

  async list(): Promise<ExpenseCategory[]> {
    const rows = await this.repository.listCategories();
    return rows.map(toCategory);
  }

  async create(request: CreateExpenseCategoryRequest): Promise<ExpenseCategory> {
    // A replayed create by id, or the same name again, is the same category.
    if (request.id) {
      const existing = await this.repository.findCategory(request.id);
      if (existing?.userId) return toCategory(existing);
    }
    const byName = await this.repository.findOwnCategoryByName(request.name);
    if (byName) return toCategory(byName);

    const row = await this.repository.insertCategory({
      id: request.id,
      name: request.name,
      icon: request.icon,
    });
    if (row) return toCategory(row);

    // The id names a row the caller cannot see, or a race won by a parallel
    // request with the same name; either way the refusal must not say which.
    const raced = await this.repository.findOwnCategoryByName(request.name);
    if (raced) return toCategory(raced);

    throw apiError(
      HttpStatus.CONFLICT,
      'CATEGORY_ID_UNAVAILABLE',
      'That category id is already in use. Please retry with a new id.',
    );
  }
}

export function toCategory(row: CategoryRow): ExpenseCategory {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    icon: row.icon,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
