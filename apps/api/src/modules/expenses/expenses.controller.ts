import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateExpenseRequest,
  ExpenseResponse,
  ExpenseSummary,
  ExpensesResponse,
  ListExpensesQuery,
  PatchExpenseRequest,
  Uuid,
} from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { ExpensesService } from './expenses.service';
import { SummaryService } from './summary.service';

/**
 * `/trips/:tripId/expenses` (rest-api.md §7; FR-020 to FR-026). Access rule:
 * owner, structurally. Every body and query is a strict contract, so a
 * visibility parameter on any of these routes is a 400 before a handler runs
 * (contract test 9, FR-027).
 */
@Controller('trips/:tripId/expenses')
export class TripExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly summary: SummaryService,
  ) {}

  /** Filter by city, category, date range. */
  @Get()
  async list(
    @Param('tripId', new ZodValidationPipe(Uuid)) tripId: string,
    @Query(new ZodValidationPipe(ListExpensesQuery)) query: ListExpensesQuery,
  ): Promise<ExpensesResponse> {
    return respond(ExpensesResponse, {
      expenses: await this.expenses.list(tripId, query),
    });
  }

  /** The server resolves and freezes the rate (FR-020, FR-021). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('tripId', new ZodValidationPipe(Uuid)) tripId: string,
    @Body(new ZodValidationPipe(CreateExpenseRequest)) body: CreateExpenseRequest,
  ): Promise<ExpenseResponse> {
    return respond(ExpenseResponse, {
      expense: await this.expenses.create(tripId, body),
    });
  }

  /** `{by_category, by_day, total_home, rates_applied, pending_conversion}` (FR-025, FR-026). */
  @Get('summary')
  async summarise(
    @Param('tripId', new ZodValidationPipe(Uuid)) tripId: string,
  ): Promise<ExpenseSummary> {
    return respond(ExpenseSummary, await this.summary.forTrip(tripId));
  }
}

/** `/expenses/:id` — never recomputes a stored rate (FR-022); tombstone on delete. */
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Patch(':id')
  async patch(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Body(new ZodValidationPipe(PatchExpenseRequest)) body: PatchExpenseRequest,
  ): Promise<ExpenseResponse> {
    return respond(ExpenseResponse, { expense: await this.expenses.patch(id, body) });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ZodValidationPipe(Uuid)) id: string): Promise<void> {
    await this.expenses.remove(id);
  }
}
