import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  CreateDocumentRequest,
  DocumentContentResponse,
  DocumentResponse,
  DocumentsResponse,
  PatchDocumentRequest,
  Uuid,
} from '@triptrackr/contracts';
import type { Response } from 'express';
import { z } from 'zod';

import { RateLimited } from '@/common/guards/rate-limit.guard';
import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { DocumentSizePipe } from './document-size.pipe';
import { DocumentsService } from './documents.service';

/**
 * No document route takes a query parameter, so every one refuses any: a
 * `?is_public=true` or `?visibility=shared` is a 400, never an ignore
 * (rest-api.md §6 "no route accepts one"; FR-032; contract test 9).
 */
const NoQuery = z.strictObject({});
type NoQuery = z.infer<typeof NoQuery>;

/**
 * Responses carrying decrypted document data are never stored by a cache:
 * not the bytes, and not the list, which carries a passenger's name (FR-033).
 */
const NO_STORE = 'no-store';

/**
 * The upload is the most expensive request the API serves — up to ~14 MB of
 * JSON, a decode, an encryption and a bucket write — so it carries a tighter
 * per-traveller ceiling than the default (Constitution: cost-incurring
 * operations have a per-account ceiling).
 */
export const DOCUMENT_UPLOAD_RATE_LIMIT = { limit: 30, windowSeconds: 60 } as const;

/**
 * `/trips/:tripId/documents` (rest-api.md §6; FR-031, FR-033; tasks.md T114).
 * Access rule: owner, structurally. Visibility posture: owner-only — no route
 * here has a public variant, and none accepts a visibility parameter (FR-032).
 */
@Controller('trips/:tripId/documents')
export class TripDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Metadata and decrypted fields — no bytes, no key, no storage key. */
  @Get()
  @Header('Cache-Control', NO_STORE)
  async list(
    @Param('tripId', new ZodValidationPipe(Uuid)) tripId: string,
    @Query(new ZodValidationPipe(NoQuery)) _query: NoQuery,
  ): Promise<DocumentsResponse> {
    return respond(DocumentsResponse, { documents: await this.documents.list(tripId) });
  }

  /**
   * `{id?, type, content_type, content_base64, parsed_json?, confirmed?}`, the
   * only body above 1 MB the API reads (app.setup.ts). 201 for a new document;
   * 200 with the stored one for a replayed upload (research D-15).
   */
  @Post()
  @RateLimited(DOCUMENT_UPLOAD_RATE_LIMIT)
  async create(
    @Param('tripId', new ZodValidationPipe(Uuid)) tripId: string,
    @Query(new ZodValidationPipe(NoQuery)) _query: NoQuery,
    @Body(new DocumentSizePipe(), new ZodValidationPipe(CreateDocumentRequest))
    body: CreateDocumentRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DocumentResponse> {
    const { document, created } = await this.documents.create(tripId, body);
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);

    return respond(DocumentResponse, { document });
  }
}

/** `/documents/:id` — the bytes, the fields, the tombstone. Owner, structurally. */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** The decrypted bytes, base64 (FR-033), `Cache-Control: no-store`. */
  @Get(':id/content')
  @Header('Cache-Control', NO_STORE)
  async content(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Query(new ZodValidationPipe(NoQuery)) _query: NoQuery,
  ): Promise<DocumentContentResponse> {
    return respond(DocumentContentResponse, await this.documents.content(id));
  }

  /** `{type?, parsed_json?, confirmed?}` — confirm, correct, clear (Constitution IV). */
  @Patch(':id')
  async patch(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Query(new ZodValidationPipe(NoQuery)) _query: NoQuery,
    @Body(new ZodValidationPipe(PatchDocumentRequest)) body: PatchDocumentRequest,
  ): Promise<DocumentResponse> {
    return respond(DocumentResponse, { document: await this.documents.patch(id, body) });
  }

  /** Tombstone (FR-039). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Query(new ZodValidationPipe(NoQuery)) _query: NoQuery,
  ): Promise<void> {
    await this.documents.remove(id);
  }
}
