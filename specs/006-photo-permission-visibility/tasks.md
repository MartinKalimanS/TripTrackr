# Tasks: Photo Permission and Photo Visibility Prompt

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Rule**: every task writes its failing test first (Constitution III) and is ticked `[x]` only with an
"As built" line: what, the tests, the commit. `[P]` = different files, no dependency on an unfinished
task. Paths are under `apps/mobile/` unless they start with `docs/` or `specs/`.

## Phase 1: Specification

- [x] T601 Write `spec.md`, `plan.md`, `tasks.md`, `quickstart.md` (docs only; AGENTS.md "Spec precedes code")
      _As built:_ spec.md, plan.md (D6-01 to D6-13), tasks.md, quickstart.md; commit `8f248ac`. Prettier clean.

## Phase 2: Visibility is stored and travels (US2; FR-009, FR-012)

- [x] T602 [US2] Failing tests in `test/db/photo-repository.test.ts`: `create` stores `is_public` from its
      input and defaults to `false`; then change `db/repositories/photos.ts` (`is_public?`, default `false`)
      _As built:_ `create` takes `is_public?` (default false); 2 new tests in `test/db/photo-repository.test.ts` (red first: the stored flag was always false); commit `c730825`.
- [x] T603 [US2] Failing tests in `test/features/photo-visibility-save.test.tsx`: `saveCapturedPhotos` with
      `'public'`, with `'private'` and with no choice stores each of N photos with its own `is_public`; then
      add the `visibility` parameter to `features/photos/capture.ts`
      _As built:_ `saveCapturedPhotos(db, tripId, assets, visibility = 'private')`; 6 tests in `test/features/photo-visibility-save.test.tsx` (4 red first); commit `c60b146`.
- [x] T604 [US2] Failing tests in `test/sync/photo-visibility-push.test.ts` (real SQLite, `pushDirtyRows`,
      routed `apiFetch`): a public photo stays dirty after `markUploaded` with an `updated_at` after the
      registration's, and is pushed with `is_public: true`; a private photo is cleaned and never pushed; a
      pull older than the local row keeps it; then change `markUploaded` and pass the registration's
      `updated_at` from `features/photos/upload.ts`
      _As built:_ Finding: `RegisterPhotoRequest` has no visibility and `markUploaded` cleaned a public row, so the choice was dropped. Fixed: a public row stays dirty with `updated_at` after the device clock and the registration's stamp (`UploadReceipt.serverUpdatedAt`); a private row is cleaned as before and never pushed. 7 repository tests, 2 upload tests, 5 push/pull tests in `test/sync/photo-visibility-push.test.ts` (red first); no contract or API change; commit `d56d247`.

## Phase 3: The library permission (US1; FR-001 to FR-005)

- [x] T605 [US1] Failing tests in `test/features/photo-library-permission.test.ts` for every row of plan
      D6-03 on iOS, Android 12, 13 and 14 (`Platform`, `ImagePicker` and `PermissionsAndroid` faked); then
      write `features/photos/library-permission.ts`
      _As built:_ `features/photos/library-permission.ts`; 43 tests in `test/features/photo-library-permission.test.ts` (iOS, Android 8, 12, 13, 14; every row of D6-03); commit `951f485`.
- [x] T606 [US1] [US2] Failing tests in `test/features/photo-capture.test.tsx` (updated) and
      `test/features/photo-capture-visibility.test.tsx`: undetermined to granted, limited, denied with
      `canAskAgain` true and false, picker cancelled, camera path, dismissal is private, Public chosen, N
      photos, second tap ignored while busy, unmount adds private; then rewrite `features/photos/use-capture.ts`
      _As built:_ `useCapture` rewritten (check, ask, pick, prompt, save; `allowLibraryAccess`; unmount is private); 27 new tests in `test/features/photo-capture-visibility.test.tsx`, the two old suites adapted through `test/features/photo-capture-prompt.ts` (70 tests green); commit `1dedc33`.

## Phase 4: The screens (US2, US3; FR-004, FR-006 to FR-008, FR-010, FR-014)

- [x] T607 [US2] Failing tests in `test/components/photo-visibility-sheet.test.tsx`: default
      selection, `radiogroup` and `radio` roles with names and checked state, singular and plural, the honest
      line, large text, reduced motion, every dismissal; then write
      `components/trip/photo-visibility-sheet.tsx` and the copy in `features/photos/photo-copy.ts`
      _As built:_ `components/trip/photo-visibility-sheet.tsx`, `VISIBILITY_COPY`, `FormActions` gains `cancelLabel` and `saveTestID`; 24 sheet tests + 1 form-actions test; fixed-heights allow-list entry (3 sites, non-text ring and dot); commits `a48684f` and `051f1ab` (Cancel stays a literal for the parity guard; unresolved-label count 79 to 82, regenerated).
- [x] T608 [US3] Failing tests in `test/state-sweep/permission-denial.test.tsx`: the library notice with "Open Settings"
      and with "Allow photo access", dismissal, Settings failure; then extend `components/trip/photos-header.tsx`
      _As built:_ `PermissionState` notice for the library in `photos-header.tsx` ("Allow photo access" or "Open Settings", text Dismiss); 7 new tests in `test/state-sweep/permission-denial.test.tsx`; commit `4924152`.
- [x] T609 [US1] [US2] [US3] Failing screen test `test/app/photo-visibility-screen.test.tsx` (add button, permission,
      picker, sheet, grid) and the existing suites made to pass (`photo-screen-harness`, a11y, appearance,
      scale, state sweep); then mount the sheet in `app/trip/[id]/photos.tsx`
      _As built:_ Sheet mounted in `app/trip/[id]/photos.tsx`; `test/app/photo-visibility-screen.test.tsx` (12 tests over a real store); harness extended; the viewer says "Public — for now only you can see this photo." for a public photo (FR-018, D6-13; test in `test/app/photo-viewer.test.tsx`); commits `9fd00a5` and `6482197`.

## Phase 5: Native configuration, store documents, flows (FR-017) [P]

- [x] T610 [P] Failing assertions in `test/config/app-config.test.ts` (the manifest permissions and the plugin
      string), then `app.config.ts`; update `STORE_COMPLIANCE.md` and `docs/release/store-readiness.md`; check
      `docs/legal/privacy-policy.md` (edit only a sentence that became untrue)
      _As built:_ `app.config.ts` (permissions, blocked list, iOS string), 10 tests in `test/config/photo-permissions-config.test.ts`, `STORE_COMPLIANCE.md`, `docs/release/store-readiness.md` (new section 2.1); `docs/legal/privacy-policy.md` checked and left unchanged (no sentence became untrue); commit `af7075a`.
- [x] T611 [P] Edit `e2e/05-photos-and-documents.yaml`, `e2e/offline/01-a-create-edit-offline.yaml` and
      `e2e/offline/_helpers/` for the permission dialog and the sheet (edited, not run)
      _As built:_ `e2e/05-photos-and-documents.yaml`, `e2e/offline/01-a-create-edit-offline.yaml`, two new helpers, README note; edited, not run; commit `0b73722`.

## Phase 6: Verify

- [x] T612 `npx jest --ci --maxWorkers=2`, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npx prettier
--check` on the touched files, the parity check, `node scripts/build-theme-css.mjs --check`,
      `test/scale/fixed-heights.test.ts`; write `as-built.md`; tree clean
      _As built:_ all gates green on the final tree: jest 426 suites and 9,878 tests (3 skipped, as before), tsc, eslint, prettier, parity (205 ids, 64 labels), theme css, fixed-heights; `as-built.md` written; the commit that adds it.
- [ ] T613 Device checks of `quickstart.md` (not done here: they need a phone and a new native build)
