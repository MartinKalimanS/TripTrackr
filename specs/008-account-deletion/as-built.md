# 008 Delete my account: as built

2026-10-28. Server half: PR #38 (`DELETE /me`, the sweep, migration 0014). App half: branch
`feat/account-deletion-app`, on the UI stack.

## App

- `modal/delete-account.tsx`: a `FormSheet` with the words of `features/auth/delete-account-copy.ts`, one secure
  password field and one destructive action ("Delete my account", `FormActions` now takes `saveVariant` and
  `saveBusy`). No primary button on the sheet.
- `features/auth/use-delete-account.ts`: `DELETE /me` with `{ password }` (or `{}`), then the session ends, then
  `wipeLocalAccount`. A refusal changes nothing on the phone.
- `features/auth/wipe-local-account.ts`: removes the staged photo files and thumbnails and the sealed document files
  the rows name, clears the offline maps, closes and deletes the encrypted database file. Never throws; failures are
  counted and reported to Sentry without a path, an id or a title.
- You: the "Delete account" row is active (was "Coming soon") and opens the sheet.
- Joined to the kits: `test/appearance/screens-trip.test.tsx` (four themes, reduced transparency),
  `test/state-sweep/route-states-delete-account.test.tsx` and the route inventory (`f14-states.md`), and
  `e2e/08-delete-account.yaml`.

## Calls I made

- The unsynced-changes warning of sign-out is not used (deleting makes unsynced changes moot).
- The password field is always shown; an account with no password leaves it empty.
- Wiping the phone happens after the session ends, so no screen is reading the database while it is closed.

## Device checks the owner must do

1. Create an account, add a trip with a photo and a document, then You > Delete account: the sheet reads well, in
   both themes and at the largest text size, and the keyboard never hides the action.
2. A wrong password shows "Enter your password to confirm." and keeps you on the sheet; Cancel closes it.
3. The right password lands on Welcome. Signing in with that e-mail is refused. On the phone (Android: Settings >
   Apps > Storage; iOS: Settings > General > iPhone Storage) the app's data shrinks; nothing of the trip remains in
   the app.
4. With the phone in airplane mode the action says it could not reach the server and nothing is deleted.
5. After the worker has run, the server holds nothing of the account (the residue test proves it; look once on the
   real store).
