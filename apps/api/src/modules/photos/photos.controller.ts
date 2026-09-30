import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import {
  CreatePhotoUploadRequest,
  PatchPhotoRequest,
  PhotoOriginalResponse,
  PhotoResponse,
  PhotoUploadResponse,
  PhotosResponse,
  RegisterPhotoRequest,
  Uuid,
} from '@triptrackr/contracts';
import type { Response } from 'express';

import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { PhotosService } from './photos.service';

/**
 * `/trips/:tripId/photos` (rest-api.md §5; FR-028, FR-030, FR-041). Access
 * rule: owner, in this story — see photos.service.ts for why the public list
 * waits for User Story 7.
 */
@Controller('trips/:tripId/photos')
export class TripPhotosController {
  constructor(private readonly photos: PhotosService) {}

  /**
   * `{content_type}` → a pre-signed PUT for a key the server chose (research
   * D-34). 200, not 201: a URL is signed, and nothing is stored until
   * registration.
   */
  @Post('upload-url')
  @HttpCode(HttpStatus.OK)
  async createUploadUrl(
    @Param('tripId', new ZodValidationPipe(Uuid)) tripId: string,
    @Body(new ZodValidationPipe(CreatePhotoUploadRequest)) body: CreatePhotoUploadRequest,
  ): Promise<PhotoUploadResponse> {
    return respond(PhotoUploadResponse, await this.photos.createUploadUrl(tripId, body));
  }

  /**
   * Registers the metadata once the bytes have landed, and enqueues the media
   * worker (FR-028, FR-029). 201 when this call stored the photo; 200 when a
   * retry by client id found it already stored (research D-15), so the device
   * can tell a first write from a replay without comparing bodies.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Param('tripId', new ZodValidationPipe(Uuid)) tripId: string,
    @Body(new ZodValidationPipe(RegisterPhotoRequest)) body: RegisterPhotoRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PhotoResponse> {
    const { photo, created } = await this.photos.register(tripId, body);
    if (!created) response.status(HttpStatus.OK);
    return respond(PhotoResponse, { photo });
  }

  /** Short-lived signed thumbnail URLs; never an original's (FR-030). */
  @Get()
  async list(
    @Param('tripId', new ZodValidationPipe(Uuid)) tripId: string,
  ): Promise<PhotosResponse> {
    return respond(PhotosResponse, { photos: await this.photos.list(tripId) });
  }
}

/** `/photos/:id` — the original on request, visibility and filing, tombstone. */
@Controller('photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  /** Owner-or-public: whatever `photos_public_read` lets the caller read (FR-030, FR-056). */
  @Get(':id/original')
  async original(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
  ): Promise<PhotoOriginalResponse> {
    return respond(PhotoOriginalResponse, await this.photos.original(id));
  }

  /** `is_public` is accepted while screening is pending (rest-api.md §5); `city_id` refiles. */
  @Patch(':id')
  async patch(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Body(new ZodValidationPipe(PatchPhotoRequest)) body: PatchPhotoRequest,
  ): Promise<PhotoResponse> {
    return respond(PhotoResponse, { photo: await this.photos.patch(id, body) });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ZodValidationPipe(Uuid)) id: string): Promise<void> {
    await this.photos.remove(id);
  }
}
