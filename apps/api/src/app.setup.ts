import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

/**
 * Base path for every route except `/health` (contracts/README.md: the base URL
 * is `…/v1`). Excluding the health check keeps the orchestrator's probe at a
 * fixed path that does not move with the API version (Dockerfile HEALTHCHECK).
 */
export const API_PREFIX = 'v1';
export const HEALTH_PATH = 'health';

/**
 * Largest request body the API accepts.
 *
 * Nest's default is 100 kB, which a day's sync push — a batch of notes with
 * bodies, or a few dozen expenses — can exceed on a single reconnect
 * (sync-protocol.md §2, "batched"). A megabyte covers that comfortably and is
 * still far too small to be a useful denial-of-service payload. Bytes for
 * photos and documents never pass through here at all; they go straight to
 * object storage on a pre-signed URL (storage.service.ts).
 */
export const BODY_LIMIT = '1mb';

/**
 * Everything the HTTP surface needs that is not a module.
 *
 * Shared between `main.ts` and the contract suite so that the app under test is
 * the app that ships — a prefix, a body limit or a header set only in bootstrap
 * would be a difference between what the tests prove and what runs.
 */
export function configureApp(app: NestExpressApplication): void {
  // nestjs-pino replaces Nest's console logger. `bufferLogs: true` at creation
  // held everything until this line, so even the boot messages come out as
  // structured lines with the redaction list applied (logger.module.ts).
  app.useLogger(app.get(Logger));

  // Sensible response headers, none of which a JSON API needs to think about
  // individually: no sniffing, no framing, no referrer leakage.
  app.use(helmet());

  // An explicit decision, not an omission. The only client is a native app,
  // which sends no Origin and needs no CORS grant; a browser page on some other
  // origin is never a legitimate caller. `origin: false` sets no
  // Access-Control-Allow-Origin header at all, so a browser refuses the
  // response for the caller — the same posture as no CORS middleware, written
  // down so it reads as chosen.
  app.enableCors({ origin: false });

  // JSON only. The API has no form-encoded route, so no urlencoded parser is
  // registered; a form body arrives unparsed and fails validation like any
  // other malformed payload.
  app.useBodyParser('json', { limit: BODY_LIMIT });

  app.setGlobalPrefix(API_PREFIX, { exclude: [HEALTH_PATH] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // FR-027 / FR-032 depend on this: a visibility parameter smuggled onto an
      // expense or document payload is rejected outright rather than ignored.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
