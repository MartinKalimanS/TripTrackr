import { prettyTransport } from '@/common/logging/pretty-transport';

/**
 * The API's log transport. Pretty output is a convenience of running on the
 * host with dev dependencies installed; the Docker image is built with
 * `npm ci --omit=dev`, so `pino-pretty` is absent there even when the stack
 * runs with NODE_ENV=development (compose passes the root .env through). Asking
 * pino for a transport that cannot be resolved crashes the API at boot, so the
 * choice must follow what is actually installed.
 */

const installed = () => '/node_modules/pino-pretty/index.js';
const missing = (): string => {
  throw new Error("Cannot find module 'pino-pretty'");
};

describe('prettyTransport', () => {
  it('is JSON (no transport) in production, where a log shipper reads it', () => {
    expect(prettyTransport('production', installed)).toBeUndefined();
  });

  it('is off under test, where its worker thread would leak a handle', () => {
    expect(prettyTransport('test', installed)).toBeUndefined();
  });

  it('is pino-pretty in development when it is installed', () => {
    expect(prettyTransport('development', installed)).toEqual({
      target: 'pino-pretty',
      options: { singleLine: true },
    });
  });

  it('falls back to JSON in development when pino-pretty is not installed', () => {
    expect(prettyTransport('development', missing)).toBeUndefined();
  });
});
