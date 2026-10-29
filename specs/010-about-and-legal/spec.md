# Feature 010: About and legal

Status: built from roadmap step S-07 (T193; PR-03, PR-06, PR-10), 2026-10-29. Mobile only; no server change.

## Why

Both stores require the privacy policy, the terms, the account-deletion page and a way to reach support to be
reachable from inside the app, and two data sources (GeoNames, OpenStreetMap through Mapbox) require attribution.
Constitution V asks that the 90-day tombstone retention is said to travellers plainly.

## Requirements

- **FR-001** You has an "About TripTrackr" row that opens a sheet (`modal/about`).
- **FR-002** The sheet shows the app version and build, read from the embedded config.
- **FR-003** The sheet links to Privacy Policy, Terms of Service, "Delete your account" (the public page) and
  Support (a `mailto:`); web links open in the in-app browser (`expo-web-browser`), the mail link in the system.
- **FR-004** Every URL and the support address come from ONE module (`src/config/legal-links.ts`), derived from one
  base URL (`EXPO_PUBLIC_LEGAL_BASE_URL`, default `https://triptrackr.app`), so store launch (S-32) changes them in one place.
- **FR-005** Attributions: GeoNames (CC BY 4.0), Mapbox and OpenStreetMap contributors, and the open-source
  licence list (generated from the app's direct dependencies by `npm run licenses -w apps/mobile`).
- **FR-006** The retention statement, in plain words: removed items stay as hidden markers for 90 days so other
  devices can learn of the removal, then the markers and their files are purged; deleting the account removes
  everything at once.
- **FR-007** A link that cannot open says so in words and changes nothing.

## Visibility posture

Private and static. The sheet reads no traveller data and sends nothing to a server; opening a link hands a public
URL to the browser.

## Not in scope

The public pages themselves (S-32), counsel's approval of the texts, per-licence full texts.
