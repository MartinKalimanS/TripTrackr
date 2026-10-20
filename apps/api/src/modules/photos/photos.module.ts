import { Module } from '@nestjs/common';

import { TripsModule } from '@/modules/trips/trips.module';

import { MediaJobProducer } from './media-job.producer';
import { PhotosController, TripPhotosController } from './photos.controller';
import { PhotosRepository } from './photos.repository';
import { PhotosService } from './photos.service';

/**
 * Photos (User Story 5; rest-api.md §5; FR-028 to FR-030, FR-041, FR-056;
 * research D-12, D-34). The bytes go straight to the private photos bucket on a
 * pre-signed PUT; this module signs, registers, lists, refiles and tombstones,
 * and hands every registered photo to the media worker (workers/
 * media.processor.ts) on the `media` queue.
 *
 * Visibility posture: owner + explicit public, **and** `moderation_state =
 * 'approved'`, **and** the parent trip public (data-model.md §5), all three in
 * the `photos_public_read` predicate (0005). In this story the upload URL,
 * registration, list, patch and delete are owner-only; the original is
 * owner-or-public exactly as far as that policy lets a stranger read the row —
 * and until User Story 7 chooses a screener every photo stays `pending`
 * (research D-34), so that is nobody but the owner. The curated public list
 * (FR-055), which must leave out the EXIF position, arrives with User Story 7.
 *
 * `StorageService` and the queues come from their global modules.
 */
@Module({
  imports: [TripsModule],
  controllers: [TripPhotosController, PhotosController],
  providers: [PhotosRepository, PhotosService, MediaJobProducer],
})
export class PhotosModule {}
