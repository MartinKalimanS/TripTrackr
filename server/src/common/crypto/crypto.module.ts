import { Global, Module } from '@nestjs/common';

import { EnvelopeService } from './envelope.service';

/**
 * Global: the documents module seals on write and opens on read, and the account
 * export worker opens too. The service is stateless — it holds no key material
 * between calls — so a single shared instance carries no risk of one request's
 * key outliving it.
 */
@Global()
@Module({
  providers: [EnvelopeService],
  exports: [EnvelopeService],
})
export class CryptoModule {}
