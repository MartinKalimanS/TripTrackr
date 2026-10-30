# Feature 012: as built

## What exists

- `POST /auth/oauth/nonce` (public, 60 an hour per address) issues 32 random bytes, base64url. Migration `0016` keeps
  only the SHA-256 in `oauth_nonces`, a deny-all table reachable through `auth_issue_oauth_nonce` and
  `auth_consume_oauth_nonce`. Issuing also deletes expired rows.
- `POST /auth/oauth/google` and `/apple` require `nonce`. `OAuthTokenVerifier` compares the token's `nonce` claim in
  constant time (Google: the nonce; Apple: its SHA-256 in hex); `OAuthService` then spends it. A token that fails
  verification does not burn the nonce.
- App: `features/auth/oauth-nonce.ts` (fetch, hash), `use-oauth-nonce.ts` (Google: a nonce ready before the request is
  built, a new one after every attempt). Apple fetches its nonce on press and passes the hash to `signInAsync`.

## What the owner provides

The Google client ids (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`; server
`GOOGLE_OAUTH_CLIENT_IDS`) and the Apple bundle id (server `APPLE_OAUTH_CLIENT_IDS`, the capability is already in
`app.config.ts`). Until they are set the Google button shows as coming soon and the server answers 503 for that provider.

## Device checks (not run: no credentials yet)

1. Continue with Google on iOS and Android: signs in, and a second sign-in works (a fresh nonce is fetched each time).
2. Continue with Apple on an iOS device: signs in, and the account is created with the name Apple gave on first use.
3. Airplane mode, then the Google or Apple button: an error in words, nothing signs in.
4. Replay: copy the request body of a successful sign-in and send it again with a tool such as curl: `401
OAUTH_TOKEN_INVALID`.
