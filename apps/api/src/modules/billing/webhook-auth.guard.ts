import { createHash, timingSafeEqual } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { loadEnv } from '@/common/config/env.schema';

const BEARER = 'Bearer ';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/**
 * Authenticates RevenueCat's webhook (spec 014, D14-08): the `Authorization` header must be the
 * shared secret, bare or as a bearer token. Both sides are hashed first so the comparison is
 * constant-time whatever the lengths, and it runs as a guard, before the handler reads the body.
 * Answers 401 with no detail either way: a caller learns nothing about why.
 */
@Injectable()
export class WebhookAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers.authorization;
    const presented = header?.startsWith(BEARER) ? header.slice(BEARER.length) : (header ?? '');

    const matches = timingSafeEqual(
      digest(presented),
      digest(loadEnv().REVENUECAT_WEBHOOK_SECRET),
    );
    if (!matches) throw new UnauthorizedException();
    return true;
  }
}
