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
  Query,
} from '@nestjs/common';
import {
  CreateNoteRequest,
  ListNotesQuery,
  NoteResponse,
  NotesResponse,
  PatchNoteRequest,
  Uuid,
} from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { NotesService } from './notes.service';

/** `/trips/:tripId/notes` (rest-api.md §4; FR-017). Access rule: owner. */
@Controller('trips/:tripId/notes')
export class TripNotesController {
  constructor(private readonly notes: NotesService) {}

  /** `?city_id=` / `?country_id=` filters. */
  @Get()
  async list(
    @Param('tripId', new ZodValidationPipe(Uuid)) tripId: string,
    @Query(new ZodValidationPipe(ListNotesQuery)) query: ListNotesQuery,
  ): Promise<NotesResponse> {
    return respond(NotesResponse, { notes: await this.notes.list(tripId, query) });
  }

  /** `{title, body, country_id, city_id?, is_public}`. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('tripId', new ZodValidationPipe(Uuid)) tripId: string,
    @Body(new ZodValidationPipe(CreateNoteRequest)) body: CreateNoteRequest,
  ): Promise<NoteResponse> {
    return respond(NoteResponse, { note: await this.notes.create(tripId, body) });
  }
}

/** `/notes/:id` — edit, move between levels (FR-018), tombstone (FR-039). */
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Patch(':id')
  async patch(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Body(new ZodValidationPipe(PatchNoteRequest)) body: PatchNoteRequest,
  ): Promise<NoteResponse> {
    return respond(NoteResponse, { note: await this.notes.patch(id, body) });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ZodValidationPipe(Uuid)) id: string): Promise<void> {
    await this.notes.remove(id);
  }
}
