import { Module } from '@nestjs/common';

import { TripsModule } from '@/modules/trips/trips.module';

import { NotesController, TripNotesController } from './notes.controller';
import { NotesRepository } from './notes.repository';
import { NotesService } from './notes.service';

/**
 * Notes at three anchor levels (rest-api.md §4; FR-017 to FR-019).
 *
 * Visibility posture: owner-only in this story. `notes_public_read` (0005)
 * exists for the curated public view of a public trip, which arrives with the
 * social story behind the sync gate; these routes never serve it.
 */
@Module({
  imports: [TripsModule],
  controllers: [TripNotesController, NotesController],
  providers: [NotesRepository, NotesService],
})
export class NotesModule {}
