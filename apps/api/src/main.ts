import * as Sentry from '@sentry/nestjs';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';

import { AppModule } from './app.module';
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

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // FR-027 / FR-032 depend on this: a visibility parameter smuggled onto an
      // expense or document payload is rejected outright rather than ignored.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`TripTrackr API listening on port ${env.PORT}`);
}

void bootstrap();
