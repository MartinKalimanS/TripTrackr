/**
 * The nonce a Google or Apple sign-in is bound to (spec 012; FR-001 to FR-005).
 *
 * The server issues it (`POST /auth/oauth/nonce`), the app hands it to the provider for ONE
 * attempt and sends it back with the token the provider returned; the server accepts it once.
 * Google echoes the nonce in its token, Apple echoes the SHA-256 the app gave it, so the raw
 * value never appears in an Apple token.
 */
import { OAuthNonceResponse } from '@triptrackr/contracts';
import * as Crypto from 'expo-crypto';

import { apiFetch } from '@/lib/api-client';

/** A fresh single-use nonce. Public route: there is no session yet. */
export async function fetchOAuthNonce(): Promise<string> {
  const { nonce } = await apiFetch(OAuthNonceResponse, '/auth/oauth/nonce', {
    method: 'POST',
    auth: false,
  });
  return nonce;
}

/** Lower-case hex SHA-256: what Apple is given and what the server expects back. */
export function hashNonce(nonce: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
}
