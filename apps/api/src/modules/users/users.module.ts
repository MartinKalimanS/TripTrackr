import { Module } from '@nestjs/common';

import { TravelStatsService } from './travel-stats.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';

/**
 * Profile and travel statistics (rest-api.md §2; FR-008, FR-050).
 *
 * `UsersRepository` is exported because the auth module needs the same
 * profile serialiser for the `user` in `AuthTokens`: one column list, one
 * shape, so registration, login and `/me` cannot disagree about what a
 * traveller sees of themselves. The dependency runs one way — auth imports
 * users, never the reverse.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersRepository, TravelStatsService],
  exports: [UsersRepository],
})
export class UsersModule {}
