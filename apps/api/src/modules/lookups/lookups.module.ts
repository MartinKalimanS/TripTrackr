import { Module } from '@nestjs/common';

import { LookupsController } from './lookups.controller';
import { LookupsService } from './lookups.service';

/**
 * Reference geography lookups (rest-api.md §11; FR-014; research D-11).
 *
 * Visibility posture: reference — not traveller-owned, world-readable, never
 * written by a traveller. The tables behind it carry no RLS by design
 * (data-model.md §1), and this module writes nothing.
 */
@Module({
  controllers: [LookupsController],
  providers: [LookupsService],
})
export class LookupsModule {}
