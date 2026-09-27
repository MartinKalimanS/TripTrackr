import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { getCurrentUserId } from '@/common/rls/rls-context';

export const IS_PUBLIC_KEY = 'is_public_route';

/** Marks a route as reachable without an access token — `/auth/*`, health checks. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Requires an authenticated traveller.
 *
 * **This guard verifies nothing.** RlsSessionMiddleware has already verified the
 * bearer token and put the resulting identity in the request's RLS context; all
 * this does is turn "no identity" into a clean 401.
 *
 * The split matters. If the guard did the verifying, there would be a window
 * between the transaction opening and the guard running in which a query could
 * execute with no session identity — and the identity the policies use could
 * differ from the identity the guard checked. Verifying once, in the middleware,
 * means there is exactly one answer to "who is asking", and both the policies and
 * this guard read it from the same place.
 *
 * Registered globally, with routes opting out via `@Public()`. The inverse —
 * opting in per route — makes an unprotected endpoint the result of *forgetting*
 * something, and this codebase prefers mistakes that fail closed.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    if (!getCurrentUserId()) {
      // Deliberately one message for every cause — absent, malformed, expired,
      // forged. Distinguishing them tells an attacker which of their guesses was
      // closest (FR-072).
      throw new UnauthorizedException('Please sign in again.');
    }

    return true;
  }
}
