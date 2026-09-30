import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MAX_DOCUMENT_BYTES, maxBase64Length } from '@triptrackr/contracts';
import {
  json,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { documentTooLarge } from '@/modules/documents/documents.errors';

/**
 * Base path for every route except `/health` (contracts/README.md: the base URL
 * is `…/v1`). Excluding the health check keeps the orchestrator's probe at a
 * fixed path that does not move with the API version (Dockerfile HEALTHCHECK).
 */
export const API_PREFIX = 'v1';
export const HEALTH_PATH = 'health';

const MEGABYTE = 1024 * 1024;

/**
 * Largest request body the API accepts — on every route but one.
 *
 * Nest's default is 100 kB, which a day's sync push — a batch of notes with
 * bodies, or a few dozen expenses — can exceed on a single reconnect
 * (sync-protocol.md §2, "batched"). A megabyte covers that comfortably and is
 * still far too small to be a useful denial-of-service payload. A photo's bytes
 * never pass through the API: they go straight to object storage on a
 * pre-signed URL (storage.service.ts). A document's do, on the one route below.
 */
export const BODY_LIMIT = '1mb';

/**
 * The one route whose body carries a file: a document, base64 in JSON, sealed
 * by the API before the bucket sees it (rest-api.md §6; research D-32).
 */
export const DOCUMENT_UPLOAD_PATH = `/${API_PREFIX}/trips/:tripId/documents`;

/**
 * That route's body limit: the base64 of the largest document the contract
 * admits, plus the same megabyte every other body gets for the rest of the
 * JSON — generous for three short fields, and room for an encoder that escapes
 * `/`. About 14.3 MiB. Derived from MAX_DOCUMENT_BYTES, so the two cannot drift.
 */
export const DOCUMENT_BODY_LIMIT = maxBase64Length(MAX_DOCUMENT_BYTES) + MEGABYTE;

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
  //
  // The document upload's parser goes first and reads that one route's body;
  // the global parser then finds the body already read and passes it on. Every
  // other route, including every other document route, keeps the megabyte.
  app.use(DOCUMENT_UPLOAD_PATH, documentUploadParser());
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

/**
 * The JSON parser for `POST` {@link DOCUMENT_UPLOAD_PATH} alone, with
 * {@link DOCUMENT_BODY_LIMIT}.
 *
 * It is Express's own `json()` — the very parser Nest's `useBodyParser('json')`
 * builds (`express[type](options)` in @nestjs/platform-express's adapter) —
 * from the `express` that @nestjs/platform-express pins and installs, typed by
 * the declared @types/express. So: no new dependency, one parser
 * implementation behind both limits, and the same `http-errors` 413 the
 * exception filter already recognises. Nest has no per-route limit of its own;
 * `useBodyParser` registers globally.
 *
 * Mounted on the path, then narrowed to the exact route and to POST: a mount
 * path matches as a prefix, and a GET of the list carries no body anyway. Over
 * the limit, the parser's generic 413 becomes the route's own
 * `413 DOCUMENT_TOO_LARGE` — the only large thing this body carries is the
 * document, and the client should see one answer for one condition.
 */
function documentUploadParser(): RequestHandler {
  const parse = json({ limit: DOCUMENT_BODY_LIMIT });

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'POST' || req.path !== '/') {
      next();
      return;
    }

    parse(req, res, (error?: unknown) => {
      next(isEntityTooLarge(error) ? documentTooLarge() : error);
    });
  };
}

/** body-parser's (raw-body's) refusal of a body over its limit. */
function isEntityTooLarge(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { type?: unknown }).type === 'entity.too.large'
  );
}
