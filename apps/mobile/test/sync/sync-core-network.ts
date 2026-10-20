/**
 * The network double for the sync-core suites. Only suites that also
 * `jest.mock('@/lib/sentry')` and `jest.mock('@/lib/api-client')` import it:
 * `routeApi` replaces `apiFetch` with a router that, like the real client,
 * validates every answer against the schema the caller named — so a fixture the
 * contract would refuse fails the test rather than flattering the code under
 * test.
 */
import { ApiRequestError } from '@/lib/api-client';

export function networkError(): ApiRequestError {
  return new ApiRequestError(0, { code: 'NETWORK', message: 'offline' });
}

export interface ApiCall {
  path: string;
  body: unknown;
}

type Route = (call: ApiCall) => unknown | Promise<unknown>;

/**
 * Point the mocked `apiFetch` at `routes`. The answer of a route goes through
 * the caller's schema exactly as `apiFetch` validates a real body; a route that
 * throws stands for a failed request.
 */
export function routeApi(
  mock: jest.Mock,
  routes: { push?: Route; pull?: Route },
): ApiCall[] {
  const calls: ApiCall[] = [];
  mock.mockReset();
  mock.mockImplementation(
    async (
      schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
      path: string,
      options?: { body?: unknown },
    ) => {
      const call = { path, body: options?.body };
      calls.push(call);
      const route = path.startsWith('/sync/push') ? routes.push : routes.pull;
      if (!route) throw new Error(`fixture: no route for ${path}`);
      const parsed = schema.safeParse(await route(call));
      if (!parsed.success) {
        // what the real `apiFetch` reports for a body that breaks its contract
        throw new ApiRequestError(200, { code: 'INVALID_RESPONSE', message: 'contract' });
      }
      return parsed.data;
    },
  );
  return calls;
}
