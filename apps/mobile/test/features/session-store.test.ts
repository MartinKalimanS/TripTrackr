/**
 * R009 — the auth gate's source of truth.
 *
 * The root layout decides between the `(auth)` and `(tabs)` groups from this
 * store alone, so the properties that matter are the ones a wrong decision
 * would violate: it must not claim either state before the keychain has been
 * read, it must read the agreed key, and when the keychain cannot answer it
 * must fail CLOSED — a traveller asked to sign in again loses a few seconds; a
 * traveller shown someone else's globe loses far more (Constitution I).
 *
 * Hydration is a local read. Token refresh and sign-in against the API arrive
 * with US1 (T065) and build on this store rather than replacing it.
 */
import * as SecureStore from 'expo-secure-store';

import { SESSION_KEY, useSessionStore } from '@/features/auth/session-store';

const secureStore = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  __reset: () => void;
};

beforeEach(() => {
  secureStore.__reset();
  useSessionStore.setState({ status: 'loading' });
});

describe('session store — auth gate state', () => {
  test('starts loading, so the gate cannot decide before the keychain has been read', () => {
    expect(useSessionStore.getState().status).toBe('loading');
  });

  test('uses the agreed keychain key', () => {
    // The API client (T039) and the sign-in mutation (T065) write this key.
    // If it drifts, a signed-in traveller is shown the welcome screen on every
    // launch — a bug that only appears on a real device after a restart.
    expect(SESSION_KEY).toBe('triptrackr.session');
  });

  test('hydrates to signed-in when a session token is stored', async () => {
    await SecureStore.setItemAsync(SESSION_KEY, 'opaque-refresh-token');

    await useSessionStore.getState().hydrate();

    expect(useSessionStore.getState().status).toBe('signed-in');
    expect(secureStore.getItemAsync).toHaveBeenCalledWith(SESSION_KEY);
  });

  test('hydrates to signed-out when nothing is stored', async () => {
    await useSessionStore.getState().hydrate();
    expect(useSessionStore.getState().status).toBe('signed-out');
  });

  test('treats an empty string as no session rather than as a token', async () => {
    await SecureStore.setItemAsync(SESSION_KEY, '');
    await useSessionStore.getState().hydrate();
    expect(useSessionStore.getState().status).toBe('signed-out');
  });

  test('fails closed AND surfaces the error when the keychain cannot be read', async () => {
    // Constitution: errors are never swallowed. But the gate also cannot stay
    // on `loading` forever — that is a splash screen that never goes away — so
    // the store settles on the safe state and rethrows for the caller to report.
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('Keychain unavailable'));

    await expect(useSessionStore.getState().hydrate()).rejects.toThrow(
      'Keychain unavailable',
    );
    expect(useSessionStore.getState().status).toBe('signed-out');
  });

  test('performs no network call — hydration is a local read (Principle II)', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/features/auth/session-store'), 'utf8') as string;
    expect(source).not.toMatch(/fetch\(|axios|useQuery|api-client/);
  });
});
