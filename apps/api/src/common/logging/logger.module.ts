import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { loadEnv } from '@/common/config/env.schema';

/**
 * Structured request logging.
 *
 * The redaction list below is the part worth reading. This service handles
 * credentials, wrapped document keys, and signed URLs that are themselves bearer
 * capabilities — a logged signed URL is a document anyone with log access can
 * fetch until it expires. Redaction is therefore a privacy control (Constitution
 * I), not tidiness, and the list is deny-by-default in shape: whole request and
 * response bodies are never logged, only named metadata.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      useFactory: () => {
        const env = loadEnv();
        const isProduction = env.NODE_ENV === 'production';
        const isTest = env.NODE_ENV === 'test';

        return {
          // Every route, in the named-wildcard form Nest 11's router expects.
          // nestjs-pino's own default is the legacy bare `*`, which Nest
          // rewrites at boot with a warning; the two spellings match the same
          // requests, and this one matches RlsModule.
          forRoutes: [{ path: '*path', method: RequestMethod.ALL }],

          pinoHttp: {
            // Under test only refusals and failures are worth the output; a line
            // per request would bury the assertion that failed.
            level: isProduction ? 'info' : isTest ? 'warn' : 'debug',

            // Pretty output locally; JSON in production, where a log shipper
            // reads it. Never under test: pino-pretty runs in a worker thread,
            // which Jest cannot see to wait for and reports as a leaked handle.
            transport:
              isProduction || isTest
                ? undefined
                : { target: 'pino-pretty', options: { singleLine: true } },

            // Correlates every line of one request, and reaches the client as a
            // header so a support report can name the exact request.
            genReqId: (req, res) => {
              const existing = req.headers['x-request-id'];
              const id =
                typeof existing === 'string' && existing ? existing : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },

            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-api-key"]',
                'res.headers["set-cookie"]',
                // Signed URLs carry their credential in the query string. The
                // whole URL is withheld rather than the query alone, because a
                // storage key names a traveller's document even without the
                // signature.
                'req.query.signature',
                'res.body.url',
                'res.body.upload_url',
                'res.body.download_url',
              ],
              censor: '[redacted]',
            },

            // An expected refusal is not an incident. A 401 on an expired token is
            // ordinary traffic and logging it at error level trains people to
            // ignore errors.
            customLogLevel: (_req, res, err) => {
              if (err || res.statusCode >= 500) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },

            // Explicitly named fields, never the whole object. Serialising a
            // request wholesale is how a body ends up in a log.
            serializers: {
              req: (req: { id: unknown; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                // Path only: a query string can carry a search term, and a search
                // term can be a person's name.
                url: req.url.split('?')[0],
              }),
              res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
            },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
