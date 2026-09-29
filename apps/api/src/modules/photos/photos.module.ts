import { Module } from '@nestjs/common';

/**
 * Photos (User Story 5; rest-api.md §5; research D-12, D-34). Registered in
 * AppModule ahead of its controllers so the photo and document halves of the
 * story can land independently.
 */
@Module({})
export class PhotosModule {}
