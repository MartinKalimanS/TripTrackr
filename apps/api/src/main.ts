import * as Sentry from '@sentry/nestjs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadEnv } from './common/config/env.schema';

async function bootstrap(): Promise<void> {
  // Validate the environment before anything else touches it. A missing secret
  // stops the process here with a readable list (Constitution, Platform Constraints).
  const env = loadEnv();

  // FR-073: failures affecting travellers must be visible to the team.
  if (env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Held until configureApp installs the pino logger, so nothing is written
    // through the console logger the redaction list does not cover.
    bufferLogs: true,
    // Registered by configureApp with an explicit limit instead of the default.
    bodyParser: false,
  });

  configureApp(app);

  // SIGTERM from the orchestrator runs every onApplicationShutdown hook: the
  // pool drains, the Redis clients quit, in-flight transactions settle. Without
  // this a deploy kills requests mid-transaction and leaves them to roll back
  // on their own.
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  app.get(Logger).log(`TripTrackr API listening on port ${env.PORT}`, 'Bootstrap');
}

void bootstrap();
