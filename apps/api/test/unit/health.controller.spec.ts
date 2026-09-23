import { Test } from '@nestjs/testing';

import { IS_PUBLIC_KEY } from '@/common/auth/jwt.guard';
import { PG_CONNECTION } from '@/common/db/db.module';
import { HealthController } from '@/modules/health/health.controller';

/**
 * `GET /health` is what the container orchestrator believes about this process
 * (Dockerfile HEALTHCHECK). Two properties matter and both are cheap to prove:
 * it says "ok" only when the database answers, and it is reachable without a
 * token — a health check that returned 401 would mark a perfectly healthy API
 * unhealthy and have it restarted forever.
 */
describe('HealthController', () => {
  let controller: HealthController;
  let sql: jest.Mock;

  beforeEach(async () => {
    // The pool is a tagged template; a jest.fn stands in for it because every
    // call shape reduces to (strings, ...values).
    sql = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PG_CONNECTION, useValue: sql }],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('reports ok once the database has answered', async () => {
    // Act
    const body = await controller.check();

    // Assert
    expect(body).toEqual({ status: 'ok' });
    expect(sql).toHaveBeenCalledTimes(1);

    const [strings] = sql.mock.calls[0] as [TemplateStringsArray];
    expect(strings.join('')).toMatch(/SELECT 1/);
  });

  it('propagates a database failure rather than reporting ok anyway', async () => {
    // Arrange — an unreachable database. The exception filter turns this into a
    // 500, which is exactly what the orchestrator should see.
    sql.mockRejectedValueOnce(new Error('connection refused'));

    // Act + Assert
    await expect(controller.check()).rejects.toThrow('connection refused');
  });

  it('is marked public, so the global JwtAuthGuard lets it through', () => {
    // The guard reads this key from the class; without it every probe is a 401.
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
  });
});
