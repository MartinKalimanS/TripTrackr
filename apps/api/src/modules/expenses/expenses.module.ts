import { Module } from '@nestjs/common';

import { TripsModule } from '@/modules/trips/trips.module';

import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ExpensesController, TripExpensesController } from './expenses.controller';
import { ExpensesRepository } from './expenses.repository';
import { ExpensesService } from './expenses.service';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';
import { SummaryService } from './summary.service';

/**
 * Expenses, categories, the spending summary, and the FX snapshot
 * (rest-api.md §7, §11; FR-020 to FR-027).
 *
 * Visibility posture: **owner-only, structurally.** No route here has a
 * public variant, no write shape accepts a visibility key, and the table has
 * no public-read policy (FR-027, Constitution I). The daily FX refresh that
 * feeds `FxService` lives in the worker (`workers/fx-refresh.processor.ts`).
 *
 * TripsModule is imported for `TripsService.loadOwned`, the one ownership
 * check every trip-scoped route begins with.
 */
@Module({
  imports: [TripsModule],
  controllers: [
    TripExpensesController,
    ExpensesController,
    CategoriesController,
    FxController,
  ],
  providers: [
    ExpensesRepository,
    ExpensesService,
    CategoriesService,
    SummaryService,
    FxService,
  ],
  exports: [FxService],
})
export class ExpensesModule {}
