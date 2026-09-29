import { Module } from '@nestjs/common';

/**
 * Travel documents (User Story 5; rest-api.md §6; research D-32, D-33).
 * Owner-only, structurally. Registered in AppModule ahead of its controllers
 * so the photo and document halves of the story can land independently.
 */
@Module({})
export class DocumentsModule {}
