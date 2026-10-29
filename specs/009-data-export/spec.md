# Feature 009: Export my data

Status: built from roadmap step S-06 (T190; FR-007) at the owner's request to keep implementing (2026-10-29).
Server first; the You entry follows in its own PR.

## Why

A traveller must be able to take everything they recorded, in a form that is readable without us. It is also
the largest exfiltration path of the system: one request returns everything. So it asks for the password,
is limited to one a day, never logs what it contains, expires, and is deleted with the account.

## Goals

- **G1** `POST /me/export` starts an export; the traveller sees it become ready and downloads one zip.
- **G2** The zip holds, as plain files: the profile, trips with their stops, notes, expenses (JSON and a CSV with
  currencies and rates), photo and document metadata, and the original photo files and the document files
  themselves (opened for the owner, inside the job only).
- **G3** Nothing of another traveller is in it, and nothing of the deleted (tombstoned) rows.

## Non-goals

- No import. No other formats (the JSON and CSV are the portable form). No sharing of an export.
- No link in an email: a signed link is short-lived and an email lingers. The email only says it is ready.

## Requirements

- **FR-001** `POST /me/export` `{ password? }` (an account with a password must send it: `403
REAUTHENTICATION_REQUIRED`; 5 tries an hour per address) answers **202** `{ export }` with `status: 'pending'`.
- **FR-002** One export a day: while an export of the last 24 hours exists (pending or ready), the request is
  refused `429 EXPORT_RATE_LIMITED` with `details.export_id` of that export. A failed one does not count.
- **FR-003** `GET /me/export/:id` (owner only; another traveller's id is a 404) answers `{ export }`: `status`
  (`pending`, `ready`, `failed`, `expired`), `requested_at`, `expires_at`, and, only while `ready`, a
  `download_url` signed for the object store and valid for `S3_SIGNED_URL_TTL_SECONDS` (five minutes by default);
  each GET issues a fresh one. The archive itself is kept 24 hours.
- **FR-004** The job reads the traveller's rows **as that traveller** (row-level security applies; a query that
  forgot a filter still cannot see another account), writes a zip to a temporary file, uploads it to the private
  documents bucket under `<userId>/exports/<exportId>.zip`, and marks the row `ready`. It holds one stored object
  in memory at a time. A failure marks the row `failed` with no contents in the message.
- **FR-005** Documents are opened with the envelope service only inside the job; the plaintext exists in the
  zip and the temporary file and nowhere else, and the temporary file is deleted whatever happens.
- **FR-006** A daily cleanup removes every archive past its 24 hours (the object first, then the row is marked
  `expired`). Deleting the account removes every archive under `<userId>/` with the rest (spec 008).
- **FR-007** The request is audit-logged (the export id and the outcome, never the contents, a key or the
  traveller's data); the email says only that the export is ready and where to find it.

## Decisions that were mine (the owner may change them)

- The archive lives 24 hours; each download link five minutes.
- One zip with `profile.json`, `trips.json`, `notes.json`, `expenses.json`, `expenses.csv`, `photos.json`,
  `documents.json`, a `photos/` and a `documents/` folder and a `README.txt`.
- The archive is kept in the documents bucket under an `exports/` prefix, not in a new bucket, so no
  infrastructure changes and the account-deletion sweep already covers it.
