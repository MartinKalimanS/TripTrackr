# 009 Export my data: as built

2026-10-29. Server half: PR #44 (`POST /me/export`, `GET /me/export/:id`, the worker, the daily cleanup,
migration 0015). App half: branch `feat/data-export-app`.

## App

- You > Account: an "Export my data" row (`profile-export-data`) opens `modal/export-data.tsx`.
- `modal/export-data.tsx`: a `FormSheet` with four phases. The form says what goes in the zip and that it lasts 24
  hours, asks for the password (empty for a Google or Apple account) and has the one primary "Request my data".
  Pending says the file is being prepared and that closing loses nothing. Ready has the one primary "Download", which
  hands the short-lived signed link to the system (`Linking.openURL`; the server sends `Content-Disposition:
attachment`). Ended (failed or expired) offers "Ask again".
- `features/account/use-data-export.ts`: the request, polling every 3 s while pending, and the phase. A daily-limit
  refusal (`429`) adopts the earlier export it names instead of showing an error.
- `features/account/export-copy.ts`: the words and `describeExportError` (never the server's own wording).
- Joined to the kits: `test/appearance/screens-trip.test.tsx`, `test/state-sweep/route-states-export-data.test.tsx`,
  the route inventory (`f14-states.md`) and `e2e/09-export-data.yaml`.

## Calls I made

- No new native dependency: the system browser downloads the file. A later step may save into the app's own
  folder and share it.
- The password field is always shown; an account with no password leaves it empty.
- The link is never shown or stored; it is read fresh at each poll and only opened.

## Device checks the owner must do

1. You > Export my data: the sheet reads well in both themes and at the largest text size; the keyboard never hides
   the action.
2. A wrong password shows "Enter your password to confirm." and keeps you on the sheet.
3. With the right password it says "Preparing your file", then (worker running) "Your file is ready."; Download opens
   the system's download and the zip opens with trips, notes, expenses, photos and documents.
4. Asking again the same day brings back the same file, not an error.
5. After 24 hours the file is gone: Download no longer works and the sheet offers to ask again.
