import { Module } from '@nestjs/common';

import { TripsModule } from '@/modules/trips/trips.module';

import { BoardingPassService } from './boarding-pass.service';
import { DocumentsController, TripDocumentsController } from './documents.controller';
import { DocumentsRepository } from './documents.repository';
import { DocumentsService } from './documents.service';

/**
 * Travel documents (User Story 5; rest-api.md §6; FR-031..FR-035; research
 * D-32, D-33).
 *
 * Visibility posture: **owner-only, structurally**, and permanently so.
 * `documents` has no visibility column and `documents_owner_only` (0005) is its
 * one policy — no public-read policy exists and none may ever be added
 * (Constitution I; adversarial row 14). No route here has a public variant or
 * accepts a visibility parameter, and documents appear in no feed, discovery or
 * public trip view: not filtered out of them, absent from the queries that
 * build them.
 *
 * EnvelopeService and StorageService come from their global modules. The bytes
 * are sealed here before the bucket sees them, and there is no pre-signed URL
 * for a document of any kind (D-32).
 */
@Module({
  imports: [TripsModule],
  controllers: [TripDocumentsController, DocumentsController],
  providers: [DocumentsRepository, DocumentsService, BoardingPassService],
})
export class DocumentsModule {}
