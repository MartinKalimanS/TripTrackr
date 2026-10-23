# Tasks: Photo Permission and Photo Visibility Prompt

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Rule**: every task writes its failing test first (Constitution III) and is ticked `[x]` only with an
"As built" line: what, the tests, the commit. `[P]` = different files, no dependency on an unfinished
task. Paths are under `apps/mobile/` unless they start with `docs/` or `specs/`.

## Phase 1: Specification

- [ ] T601 Write `spec.md`, `plan.md`, `tasks.md`, `quickstart.md` (docs only; AGENTS.md "Spec precedes code")

## Phase 2: Visibility is stored and travels (US2; FR-009, FR-012)

- [ ] T602 [US2] Failing tests in `test/db/photo-repository.test.ts`: `create` stores `is_public` from its
      input and defaults to `false`; then change `db/repositories/photos.ts` (`is_public?`, default `false`)
- [ ] T603 [US2] Failing tests in `test/features/photo-visibility-save.test.tsx`: `saveCapturedPhotos` with
      `'public'`, with `'private'` and with no choice stores each of N photos with its own `is_public`; then
      add the `visibility` parameter to `features/photos/capture.ts`
- [ ] T604 [US2] Failing tests in `test/sync/photo-visibility-push.test.ts` (real SQLite, `pushDirtyRows`,
      routed `apiFetch`): a public photo stays dirty after `markUploaded` with an `updated_at` after the
      registration's, and is pushed with `is_public: true`; a private photo is cleaned and never pushed; a
      pull older than the local row keeps it; then change `markUploaded` and pass the registration's
      `updated_at` from `features/photos/upload.ts`

## Phase 3: The library permission (US1; FR-001 to FR-005)

- [ ] T605 [US1] Failing tests in `test/features/photo-library-permission.test.ts` for every row of plan
      D6-03 on iOS, Android 12, 13 and 14 (`Platform`, `ImagePicker` and `PermissionsAndroid` faked); then
      write `features/photos/library-permission.ts`
- [ ] T606 [US1] [US2] Failing tests in `test/features/photo-capture.test.tsx` (updated) and
      `test/features/photo-capture-visibility.test.tsx`: undetermined to granted, limited, denied with
      `canAskAgain` true and false, picker cancelled, camera path, dismissal is private, Public chosen, N
      photos, second tap ignored while busy, unmount adds private; then rewrite `features/photos/use-capture.ts`

## Phase 4: The screens (US2, US3; FR-004, FR-006 to FR-008, FR-010, FR-014)

- [ ] T607 [US2] Failing tests in `components/trip/__tests__/photo-visibility-sheet.test.tsx`: default
      selection, `radiogroup` and `radio` roles with names and checked state, singular and plural, the honest
      line, large text, reduced motion, every dismissal; then write
      `components/trip/photo-visibility-sheet.tsx` and the copy in `features/photos/photo-copy.ts`
- [ ] T608 [US3] Failing tests in `test/app/photos-header.test.tsx`: the library notice with "Open Settings"
      and with "Allow photo access", dismissal, Settings failure; then extend `components/trip/photos-header.tsx`
- [ ] T609 [US1] [US2] [US3] Failing screen test `test/app/photo-visibility-screen.test.tsx` (add button, permission,
      picker, sheet, grid) and the existing suites made to pass (`photo-screen-harness`, a11y, appearance,
      scale, state sweep); then mount the sheet in `app/trip/[id]/photos.tsx`

## Phase 5: Native configuration, store documents, flows (FR-017) [P]

- [ ] T610 [P] Failing assertions in `test/config/app-config.test.ts` (the manifest permissions and the plugin
      string), then `app.config.ts`; update `STORE_COMPLIANCE.md` and `docs/release/store-readiness.md`; check
      `docs/legal/privacy-policy.md` (edit only a sentence that became untrue)
- [ ] T611 [P] Edit `e2e/05-photos-and-documents.yaml`, `e2e/offline/01-a-create-edit-offline.yaml` and
      `e2e/offline/_helpers/` for the permission dialog and the sheet (edited, not run)

## Phase 6: Verify

- [ ] T612 `npx jest --ci --maxWorkers=2`, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npx prettier
--check` on the touched files, the parity check, `node scripts/build-theme-css.mjs --check`,
      `test/scale/fixed-heights.test.ts`; write `as-built.md`; tree clean
- [ ] T613 Device checks of `quickstart.md` (not done here: they need a phone and a new native build)
