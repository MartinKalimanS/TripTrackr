import { Global, Module } from '@nestjs/common';

import { StorageService } from './storage.service';

/**
 * Global because photos, documents, export and the sweep worker all need the same
 * S3 client, and building a second one per feature module would open a second
 * connection pool to the object store for no benefit.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
