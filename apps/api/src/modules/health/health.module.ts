import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/**
 * Liveness for the orchestrator. Depends on nothing but the pool, which the
 * global DbModule provides, so it cannot be broken by a feature module failing
 * to load — that is a property a health check needs more than most.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
