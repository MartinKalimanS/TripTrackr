/**
 * R009 / T065 — the auth gate's source of truth.
 *
 * The root layout decides between the `(auth)` and `(tabs)` groups from this
 * store alone, so the properties that matter are the ones a wrong decision
 * would violate: it must not claim either state before the keychain has been
 * read, it must read through the T040 wrapper, and when the keychain cannot
 * answer it must fail CLOSED — a traveller asked to sign in again loses a few
 * seconds; a traveller shown someone else's globe loses far more
 * (Constitution I).
 *
 * Hydration is a local read. The mutations that talk to the API live in
 * `use-session.ts` and write through this store's `signIn` / `signOut`.
 */
import * as SecureStore from 'expo-secure-store';

import { useSessionStore } from '@/features/auth/session-store';
import { SECURE_KEYS, setSession } from '@/lib/secure-store';

const secureStore = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  __reset: () => void;
};

const profile = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'ana@example.com',
  display_name: 'Ana',
  avatar_url: null,
  bio: null,
  home_currency: 'EUR',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2026-09-01T10:00:00.000Z',
};

beforeEach(() => {
  secureStore.__reset();
  useSessionStore.setState({ status: 'loading', user: null });
});

describe('session store — auth gate state', () => {
  test('starts loading with no traveller, so the gate cannot decide before the keychain has been read', () => {
    expect(useSessionStore.getState().status).toBe('loading');
    expect(useSessionStore.getState().user).toBeNull();
  });

  test('hydrates to signed-in with the stored profile when a full session is stored', async () => {
    await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });

    await useSessionStore.getState().hydrate();

    expect(useSessionStore.getState().status).toBe('signed-in');
    expect(useSessionStore.getState().user).toEqual(profile);
    expect(secureStore.getItemAsync).toHaveBeenCalledWith(
      SECURE_KEYS.refreshToken,
      expect.anything(),
    );
  });

  test('hydrates to signed-out when nothing is stored', async () => {
    await useSessionStore.getState().hydrate();
    expect(useSessionStore.getState().status).toBe('signed-out');
    expect(useSessionStore.getState().user).toBeNull();
  });

  test('treats a token pair with no profile as no session rather than as a traveller', async () => {
    await SecureStore.setItemAsync(SECURE_KEYS.accessToken, 'access');
    await SecureStore.setItemAsync(SECURE_KEYS.refreshToken, 'refresh');

    await useSessionStore.getState().hydrate();

    expect(useSessionStore.getState().status).toBe('signed-out');
  });

  test('no longer reads the pre-T040 single session key', async () => {
    await SecureStore.setItemAsync('triptrackr.session', 'opaque-token');

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

  test('signIn flips the gate and exposes the traveller to the signed-in screens', () => {
    useSessionStore.getState().signIn(profile);

    expect(useSessionStore.getState()).toMatchObject({
      status: 'signed-in',
      user: profile,
    });
  });

  test('signOut flips the gate and forgets the traveller', () => {
    useSessionStore.getState().signIn(profile);

    useSessionStore.getState().signOut();

    expect(useSessionStore.getState()).toMatchObject({
      status: 'signed-out',
      user: null,
    });
  });

  test('performs no network call — hydration is a local read (Principle II)', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/features/auth/session-store'), 'utf8') as string;
    expect(source).not.toMatch(/fetch\(|axios|useQuery|api-client/);
  });
});
