import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { CryptoModule } from '@/common/crypto/crypto.module';
import { DbModule } from '@/common/db/db.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { LoggerModule } from '@/common/logging/logger.module';
import { QueueModule } from '@/common/queue/queue.module';
import { RedisModule } from '@/common/redis/redis.module';
import { RlsModule } from '@/common/rls/rls.module';
import { StorageModule } from '@/common/storage/storage.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { DocumentsModule } from '@/modules/documents/documents.module';
import { ExpensesModule } from '@/modules/expenses/expenses.module';
import { HealthModule } from '@/modules/health/health.module';
import { LookupsModule } from '@/modules/lookups/lookups.module';
import { NotesModule } from '@/modules/notes/notes.module';
import { PhotosModule } from '@/modules/photos/photos.module';
import { TripsModule } from '@/modules/trips/trips.module';
import { UsersModule } from '@/modules/users/users.module';

/**
 * Root module. Feature modules are registered here as their user-story phases
 * land: auth, users, trips and lookups with User Story 1; notes and expenses
 * with User Story 2; photos and documents with User Story 5; sync, planner,
 * social and billing with theirs.
 *
 * The infrastructure modules are all `@Global()` and all imported here, once.
 * The scaffold imported only three of them, which meant the pino logger, the
 * Redis client, the queues, object storage and envelope encryption were each
 * defined and never instantiated — a request that reached a service depending
 * on one would have failed on an unresolvable provider, at runtime, in
 * production.
 *
 * AuthModule is imported here because it registers the global JwtAuthGuard,
 * and a guard registered anywhere narrower would leave the routes outside that
 * module unauthenticated by default.
 *
 * RlsModule is imported here, at the root, rather than by each feature module.
 * Its middleware must wrap every request — a feature module that forgot to
 * import it would serve its routes outside a policed transaction
 * (contracts/data-access-policy.md §1).
 *
 * Two application-wide providers are registered in this module's own list:
 *
 * - `APP_FILTER` → HttpExceptionFilter. Every thrown thing becomes the one
 *   error shape (contracts/README.md) and nothing else reaches the caller
 *   (FR-072). Registered here rather than with `useGlobalFilters()` in
 *   bootstrap so that the contract suite, which builds the app from this
 *   module, gets the same filter the process does.
 * - `APP_GUARD` → RateLimitGuard. Global guards run in the order their
 *   modules are scanned, and the root module is scanned first, so this runs
 *   *before* the JwtAuthGuard from AuthModule. That order is deliberate: an
 *   unauthenticated caller hammering `/auth/login` must be counted and
 *   throttled (FR-071), which cannot happen if the auth guard has already
 *   answered 401 before the limiter sees the request.
 */
@Module({
  imports: [
    LoggerModule,
    DbModule,
    RedisModule,
    QueueModule,
    StorageModule,
    CryptoModule,
    RlsModule,
    AuthModule,
    UsersModule,
    TripsModule,
    NotesModule,
    ExpensesModule,
    PhotosModule,
    DocumentsModule,
    LookupsModule,
    HealthModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
