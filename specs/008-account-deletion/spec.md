# Feature 008: Delete my account

Status: built from roadmap step S-05 (T188, T189) and approved with it by the owner in chat, 2026-10-28
("apruebo todo, sigue trabajando"). Implements 001 FR-006 and SC-015; Apple App Review 5.1.1(v) and Google Play
require deletion to be possible inside the app.

## Why

A traveller must be able to delete their account and everything in it, and be sure it is gone: the rows AND the files
(photos, thumbnails, sealed documents). The server half is `DELETE /me` and a sweep (`apps/api`, migration 0014). This
spec is what the traveller sees.

## Goals

- **G1** The traveller finds "Delete account" under You and understands what it does before doing it.
- **G2** One confirmation, with their password, and it is done: no support email, no waiting for a person.
- **G3** After it, this phone holds nothing of the account, and the server removes the rest.

## Non-goals

- No grace period or "undo": the sweep starts within seconds. (`docs/legal/account-deletion.md` is corrected to say so.)
- No cancelling of a store subscription (the stores own it); the sheet says so.
- No deletion while offline: the account lives on the server, so the request needs it.
- Sign in with Google or Apple has no password to send; the provider re-check is tracked with step S-09.

## Requirements

- **FR-001** You, set-apart block: the "Delete account" row is active (it was "Coming soon") and opens the sheet
  `modal/delete-account` (`profile-delete-account`, `delete-account-screen`). Its words stay "Delete account".
- **FR-002** The sheet says, in plain words: that everything is deleted for good, on every device, and cannot be undone;
  what goes (trips and stops, notes, expenses, photos and documents with their files); that it does not cancel a
  subscription (cancel it in the App Store or Google Play).
- **FR-003** One password field (`delete-account-password`), secure, with the hint that someone who signed in with
  Google or Apple leaves it empty. Two buttons: Cancel (closes, changes nothing) and "Delete my account" in the
  destructive style (never the coral primary), busy while the request runs (`delete-account-cancel`,
  `delete-account-save`).
- **FR-004** Refusals are in words, inline (`delete-account-error`), and change nothing: a wrong or missing password
  ("Enter your password to confirm."), no connection or a timeout ("We couldn't reach the server. Connect and try
  again: your account is only deleted once it can."), anything else ("Something went wrong. Nothing was deleted.").
- **FR-005** On success (the server answered 202) this device ends the session, wipes its copy (the encrypted database
  file, every staged photo and sealed document file the rows name, the offline maps) and shows the Welcome screen. A
  failure while wiping is reported to Sentry and never stops the sign-out.
- **FR-006** Privacy: the request carries the password and nothing else; the password is never stored or logged; no
  traveller data is read by this flow beyond the file paths it deletes.

## Decisions that were mine

- The unsynced-changes warning of sign-out is NOT used: deleting the account makes unsynced changes moot, and the
  sheet already says everything goes.
- The sheet always shows the password field (the client cannot know whether the account has a password).
