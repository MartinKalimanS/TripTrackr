import { Module } from '@nestjs/common';

import { DbModule } from '@/common/db/db.module';
import { RlsModule } from '@/common/rls/rls.module';
import { AuthModule } from '@/modules/auth/auth.module';

/**
 * Root module. Feature modules (auth, users, trips, notes, expenses, photos,
 * documents, sync, planner, social, billing, lookups) are registered here as their
 * user-story phases land.
 *
 * AuthModule is imported here for the same reason: it registers the global
 * JwtAuthGuard, and a guard registered anywhere narrower would leave the routes
 * outside that module unauthenticated by default.
 *
 * RlsModule is imported here, at the root, rather than by each feature module.
 * Its middleware must wrap every request — a feature module that forgot to import
 * it would serve its routes outside a policed transaction
 * (contracts/data-access-policy.md §1).
 */
@Module({
  imports: [DbModule, RlsModule, AuthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
