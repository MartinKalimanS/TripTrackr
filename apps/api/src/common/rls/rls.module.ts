import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { RlsSessionMiddleware } from './rls-session.middleware';

/**
 * Applies the RLS session middleware to every route, with no exceptions.
 *
 * An exclusion list would be the obvious convenience — health checks and the
 * auth endpoints do not need a traveller identity — and it is exactly the wrong
 * shape. An excluded route is a route whose queries run outside a policed
 * transaction, and the cost of getting that list wrong is a disclosure. Routes
 * that need no identity simply do not set one, and their queries fail closed if
 * they touch an owned table anyway.
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [RlsSessionMiddleware],
  exports: [RlsSessionMiddleware],
})
export class RlsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RlsSessionMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
