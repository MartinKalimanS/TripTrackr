import { z } from 'zod';

import { CurrencyCode, IsoDateTime, Uuid } from '../scalars';

/**
 * Authentication (rest-api.md §1).
 *
 * Emails are trimmed and lower-cased at the boundary so two spellings of one
 * address are one account; the server stores them as `citext` for the same
 * reason and the two rules agree by construction.
 */

const Email = z.string().trim().toLowerCase().email().max(254);

/**
 * Twelve characters is the floor; there is no composition rule. Length is the
 * only property that measurably resists offline guessing once the hash is
 * Argon2id, and composition rules mostly produce predictable substitutions.
 */
const Password = z.string().min(12).max(256);

const DisplayName = z.string().trim().min(1).max(60);

export const RegisterRequest = z.strictObject({
  email: Email,
  password: Password,
  display_name: DisplayName,
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const LoginRequest = z.strictObject({
  email: Email,
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/**
 * The nonce a sign-in with a provider is bound to (spec 012). Issued by `POST /auth/oauth/nonce`,
 * handed to the provider for the one attempt and sent back here with the token the provider
 * returned. The server accepts each one once.
 */
export const OAuthNonce = z.string().min(16).max(128);
export type OAuthNonce = z.infer<typeof OAuthNonce>;

/** `POST /auth/oauth/nonce`: a fresh single-use nonce, valid for ten minutes. */
export const OAuthNonceResponse = z.strictObject({ nonce: OAuthNonce });
export type OAuthNonceResponse = z.infer<typeof OAuthNonceResponse>;

/**
 * Google's `id_token`, verified server-side against Google's certificates (FR-002). Its `nonce`
 * claim must equal `nonce`.
 */
export const GoogleOAuthRequest = z.strictObject({
  id_token: z.string().min(1),
  nonce: OAuthNonce,
});
export type GoogleOAuthRequest = z.infer<typeof GoogleOAuthRequest>;

/**
 * Apple's `identity_token`, verified server-side against Apple's JWKS. Apple
 * supplies the name only on the very first authorisation, so the client passes
 * what it was given and the server uses it only when creating the account.
 */
export const AppleOAuthRequest = z.strictObject({
  identity_token: z.string().min(1),
  /** Apple's token carries the lower-case hex SHA-256 of this value as its `nonce` claim. */
  nonce: OAuthNonce,
  display_name: DisplayName.optional(),
});
export type AppleOAuthRequest = z.infer<typeof AppleOAuthRequest>;

export const RefreshRequest = z.strictObject({
  refresh_token: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequest>;

/** `POST /auth/logout` revokes exactly the presented refresh token (FR-004). */
export const LogoutRequest = RefreshRequest;
export type LogoutRequest = z.infer<typeof LogoutRequest>;

export const VerifyEmailRequest = z.strictObject({
  token: z.string().min(1),
});
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequest>;

export const PasswordResetRequest = z.strictObject({
  email: Email,
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequest>;

export const PasswordResetConfirm = z.strictObject({
  token: z.string().min(1),
  password: Password,
});
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirm>;

/**
 * The traveller as they see themselves. Strict, so a serialiser that leaks
 * `password_hash` or `deletion_requested_at` fails the contract test rather
 * than the traveller.
 */
export const UserProfile = z.strictObject({
  id: Uuid,
  email: Email,
  display_name: DisplayName,
  avatar_url: z.string().url().nullable(),
  bio: z.string().max(500).nullable(),
  home_currency: CurrencyCode,
  is_profile_public: z.boolean(),
  email_verified_at: IsoDateTime.nullable(),
  created_at: IsoDateTime,
});
export type UserProfile = z.infer<typeof UserProfile>;

/**
 * Access tokens are 15-minute JWTs; refresh tokens are opaque random strings,
 * stored only as hashes and rotated on every use (rest-api.md §1).
 */
export const AuthTokens = z.strictObject({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  user: UserProfile,
});
export type AuthTokens = z.infer<typeof AuthTokens>;

/** `POST /auth/refresh` returns a fresh pair; the profile is not re-sent. */
export const RefreshedTokens = AuthTokens.omit({ user: true });
export type RefreshedTokens = z.infer<typeof RefreshedTokens>;
