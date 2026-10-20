/**
 * API client — tasks.md T039 (contracts/README.md conventions; FR-003, FR-005).
 *
 * One function, `apiFetch`, is the only way JavaScript in this app talks to
 * the API. It owns four things so that no screen has to:
 *
 *   1. The base URL — `EXPO_PUBLIC_API_URL` + `/v1`. Expo inlines the variable
 *      at build time only when it is written exactly as
 *      `process.env.EXPO_PUBLIC_API_URL` (dot access, no destructuring —
 *      https://docs.expo.dev/guides/environment-variables.md).
 *   2. The bearer token, read from the keychain per request (T040), so a
 *      refresh in one call is seen by the next without any shared state.
 *   3. Validation of every response body against the zod schema the caller
 *      names. A body that does not match the contract is a defect (research
 *      D-13) and is reported, never handed to a screen.
 *   4. The 401 → `POST /auth/refresh` → retry-once loop, single-flight: N
 *      requests failing together produce ONE refresh, because the server
 *      rotates the refresh token on every use and treats a second use of the
 *      old one as theft (rest-api.md §1, FR-005). A refresh the server refuses
 *      ends the session on this device.
 *
 * Errors are one class, `ApiRequestError`, carrying the contract's
 * `{ code, message, details }`. Network failures are `status: 0, NETWORK`;
 * a request with no answer within `REQUEST_TIMEOUT_MS` is `status: 0, TIMEOUT`.
 */
import { ApiError, RefreshedTokens } from '@triptrackr/contracts';
import type { z } from 'zod';

import { useSessionStore } from '@/features/auth/session-store';
import { clearSession, getSession, setTokens } from '@/lib/secure-store';
import { Sentry } from '@/lib/sentry';

export type ApiErrorBody = ApiError['error'];

export class ApiRequestError extends Error {
  readonly status: number;
  readonly error: ApiErrorBody;

  constructor(status: number, error: ApiErrorBody) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.error = error;
  }

  get code(): string {
    return this.error.code;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body' | 'headers'> {
  /** Serialised as JSON. */
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Attach the bearer token and refresh on 401. Default `true`. The public
   * auth routes pass `false`: their 401 means "wrong password", not "expired".
   */
  auth?: boolean;
}

/** Product copy for failures the traveller can do nothing about right now. */
const COPY = {
  config:
    'The app is not configured with an API address. Please reinstall or contact support.',
  network: 'You seem to be offline. Your changes are saved on this device.',
  timeout: 'The server took too long to answer. Please try again.',
  unknown: 'Something went wrong on our side. Please try again in a moment.',
  invalidResponse:
    'The server sent something this version of the app does not understand.',
  sessionExpired: 'Your session has expired. Please sign in again.',
} as const;

function baseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (!configured) {
    throw new ApiRequestError(0, { code: 'CONFIG', message: COPY.config });
  }
  return `${configured.replace(/\/+$/, '')}/v1`;
}

/**
 * How long one exchange may take. React Native's networking sets no timeout
 * of its own, so a request whose answer never arrives would otherwise leave
 * the screen that asked spinning forever with nothing to say. Its `fetch` is
 * `whatwg-fetch` over XMLHttpRequest, which resolves in `xhr.onload` — once
 * the whole body is in — and aborts the XHR on `signal`, so this bounds the
 * entire exchange. Twenty seconds is generous for the slowest call, register,
 * which hashes a password server-side in well under one. A call that is
 * refreshed and retried after a 401 gets a fresh bound per attempt.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

async function performFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  // A caller's own cancellation still cancels; it is not reported as a timeout.
  const callerSignal = init.signal;
  const forwardCancel = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener('abort', forwardCancel);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (cause) {
    if (timedOut) {
      throw new ApiRequestError(0, { code: 'TIMEOUT', message: COPY.timeout });
    }
    throw new ApiRequestError(0, {
      code: 'NETWORK',
      message: COPY.network,
      details: { cause: cause instanceof Error ? cause.message : String(cause) },
    });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', forwardCancel);
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A non-JSON body (a proxy's HTML error page) is still a failed request;
    // the caller receives UNKNOWN with the status, which is what it can act on.
    return undefined;
  }
}

async function toRequestError(response: Response): Promise<ApiRequestError> {
  const body = await readJson(response);
  const parsed = ApiError.safeParse(body);
  if (parsed.success) return new ApiRequestError(response.status, parsed.data.error);
  return new ApiRequestError(response.status, { code: 'UNKNOWN', message: COPY.unknown });
}

// ---------------------------------------------------------------------------
// Refresh — single-flight
// ---------------------------------------------------------------------------

async function signOutLocally(): Promise<void> {
  await clearSession();
  useSessionStore.getState().signOut();
}

/**
 * Resolves `true` when a new pair is stored, `false` when there was no
 * session to refresh or the server refused (in which case the device is
 * signed out). A network failure is thrown, not treated as a refusal: being
 * offline is not the same as being revoked.
 */
async function performRefresh(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;

  const response = await performFetch(`${baseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });

  const parsed = response.ok ? RefreshedTokens.safeParse(await readJson(response)) : null;
  if (!parsed?.success) {
    // Either the server refused the token (rotated, revoked, expired) or it
    // returned something that is not a token pair. In both cases the session
    // cannot continue; failing closed is the only safe outcome (FR-005).
    await signOutLocally();
    return false;
  }

  await setTokens({
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
  });
  return true;
}

let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// ---------------------------------------------------------------------------
// apiFetch
// ---------------------------------------------------------------------------

async function buildInit(options: ApiFetchOptions, auth: boolean): Promise<RequestInit> {
  const { body, headers: extraHeaders, auth: _auth, ...rest } = options;
  const headers = new Headers({ Accept: 'application/json', ...extraHeaders });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (auth) {
    const session = await getSession();
    if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
  }
  return {
    ...rest,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function validate<T>(
  schema: z.ZodType<T>,
  path: string,
  status: number,
  body: unknown,
): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;

  const error = new ApiRequestError(status, {
    code: 'INVALID_RESPONSE',
    message: COPY.invalidResponse,
    details: { path, issues: parsed.error.issues.length },
  });
  // Contract drift between the two apps is a defect, not a user error (FR-073).
  // The details are structural (path and issue count), never the body itself.
  Sentry.captureException(error);
  throw error;
}

/**
 * Call the API and return the body, validated against `schema`.
 *
 * @throws {ApiRequestError} for network failures (`status: 0`), non-2xx
 *   responses (the contract's `{ code, message }`), contract violations
 *   (`INVALID_RESPONSE`), and a session the server would not refresh
 *   (`SESSION_EXPIRED` — the device has already been signed out).
 */
export async function apiFetch<T>(
  schema: z.ZodType<T>,
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const auth = options.auth ?? true;
  const url = `${baseUrl()}${path}`;

  let response = await performFetch(url, await buildInit(options, auth));

  if (response.status === 401 && auth) {
    const hadSession = await getSession();
    if (hadSession) {
      const refreshed = await refreshSession();
      if (!refreshed) {
        throw new ApiRequestError(401, {
          code: 'SESSION_EXPIRED',
          message: COPY.sessionExpired,
        });
      }
      response = await performFetch(url, await buildInit(options, auth));
    }
  }

  if (!response.ok) throw await toRequestError(response);

  return validate(schema, path, response.status, await readJson(response));
}
