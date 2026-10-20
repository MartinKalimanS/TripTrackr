import { createRequire } from 'node:module';

export interface PrettyTransport {
  readonly target: 'pino-pretty';
  readonly options: { readonly singleLine: true };
}

type Resolve = (id: string) => string;

const resolveFromHere: Resolve = (id) => createRequire(__filename).resolve(id);

/**
 * The log transport for the current environment: pretty output where it can
 * work, plain JSON everywhere else.
 *
 * `pino-pretty` is a devDependency, and the Docker image installs with
 * `--omit=dev`; the compose stack still passes the root `.env` through, so it
 * can run with NODE_ENV=development and no `pino-pretty`. pino throws at boot
 * for a transport target it cannot resolve, which took the whole API down.
 * Asking `resolve` first makes the choice follow what is installed.
 *
 * Never under test: pino-pretty runs in a worker thread, which Jest cannot see
 * to wait for and reports as a leaked handle.
 */
export function prettyTransport(
  nodeEnv: string,
  resolve: Resolve = resolveFromHere,
): PrettyTransport | undefined {
  if (nodeEnv === 'production' || nodeEnv === 'test') return undefined;

  try {
    resolve('pino-pretty');
  } catch {
    return undefined;
  }

  return { target: 'pino-pretty', options: { singleLine: true } };
}
