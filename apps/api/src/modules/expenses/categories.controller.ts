import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  CreateExpenseCategoryRequest,
  ExpenseCategoriesResponse,
  ExpenseCategoryResponse,
} from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { CategoriesService } from './categories.service';

/**
 * `/expense-categories` (rest-api.md §7; FR-023, FR-024). Access rule: owner
 * plus the system rows.
 */
@Controller('expense-categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Defaults plus the traveller's own. */
  @Get()
  async list(): Promise<ExpenseCategoriesResponse> {
    return respond(ExpenseCategoriesResponse, {
      categories: await this.categories.list(),
    });
  }

  /** User-scoped, reusable across all their trips (FR-024). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateExpenseCategoryRequest))
    body: CreateExpenseCategoryRequest,
  ): Promise<ExpenseCategoryResponse> {
    return respond(ExpenseCategoryResponse, {
      category: await this.categories.create(body),
    });
  }
}
