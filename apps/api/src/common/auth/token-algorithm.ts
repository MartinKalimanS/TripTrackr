/**
 * The one algorithm access tokens are signed with and verified against.
 *
 * Pinned on both sides, in one place, so the two cannot drift. A verifier that
 * accepts whatever `alg` the token's own header declares is the `alg: none` and
 * RS-to-HS confusion family of attacks — and the header is the attacker's to
 * write. `TokenService` signs with this; `RlsSessionMiddleware` verifies with
 * this and nothing else.
 */
export const ACCESS_TOKEN_ALGORITHM = 'HS256';
