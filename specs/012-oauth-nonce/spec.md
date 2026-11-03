# Feature 012: OAuth nonce binding

Status: built from roadmap step S-09, open finding 2 of `specs/011-auth-audit/findings.md`, at the owner's request
(2026-10-30). Server and app in one change, because the request format changes.

## Why

A Google or Apple identity token proves who signed in, not that the sign-in was for THIS request. Without a nonce a
token that leaks (a log, a proxy, a malicious app on the device) can be replayed to `POST /auth/oauth/*` until it
expires. A nonce the client invents only ties the token to the request that carried it; a nonce the SERVER issues and
accepts once also stops the replay.

## Requirements

- **FR-001** `POST /auth/oauth/nonce` (public, rate limited per address) answers `200 { nonce }`: 32 random bytes,
  base64url, valid for 10 minutes. The server stores only its SHA-256 hash.
- **FR-002** `POST /auth/oauth/google` and `POST /auth/oauth/apple` require `nonce` (16 to 128 characters).
- **FR-003** The provider token must carry that nonce: for Google the `nonce` claim equals the nonce; for Apple the
  `nonce` claim equals the lower-case hex SHA-256 of the nonce (the app hands Apple the hash, as Apple recommends, so
  the raw value never appears in the token). A missing or different claim is `401 OAUTH_TOKEN_INVALID`, the same
  refusal as any bad token.
- **FR-004** The nonce is consumed in the same step, once: a second sign-in with it, an expired one or an unknown one is
  the same `401 OAUTH_TOKEN_INVALID`. Nothing about which of those it was is revealed.
- **FR-005** The app asks for a fresh nonce for every attempt (never reuses one), before it opens the provider.

## Visibility posture

No traveller data. The nonce table has no owner, is unreadable and unwritable by the API role except through two
`SECURITY DEFINER` functions, and rows live ten minutes at most (expired rows are removed whenever a nonce is issued).

## Out of scope

Switching the Google flow to the native library; the provider credentials themselves (owner supplies them).
