/**
 * The route inventory of the state sweep (feature 005, T559; FR-064, FR-066, FR-080; research
 * D5-14; not a test file): every screen under `src/app/**` and every gate that stands in for
 * one, and for each of loading, empty and error: how it is handled, and the test that pins it.
 * The same table is in `specs/005-sunrise-passport-ui/reference/as-built/f14-states.md`;
 * `route-inventory.test.ts` fails when a route has no row, when a pinning test or the words it
 * pins are gone, and when the note drops a route.
 *
 * A `Cell` is either what the state is (`shows`) with the tests that pin it (`pins`: a test
 * file and a string that file must contain), or `na` with the reason the state cannot occur.
 * `primary` is the one primary action of each state a screen has (FR-005): "none" is a
 * statement, not a gap (a state that names no action must say why in `na`). `sweep` is the
 * runtime test that renders every state of the route and fails on a control with no handler,
 * on a coming-soon claim off the adapter and on a second primary.
 *
 * `(dev)/gallery.tsx` is the development gallery and is not inventoried (dev-only).
 */

export type Pin = readonly [file: string, needle: string];

export type Cell = { shows: string; pins: readonly Pin[] } | { na: string };

export interface RouteRow {
  /** The route file under `src/app`, or the gate component under `src/components`. */
  route: string;
  loading: Cell;
  empty: Cell;
  error: Cell;
  /** Named states beyond the three: filtered-empty, no results, permission denied, offline. */
  extra?: { name: string; cell: Cell }[];
  /** The one primary action, per state. */
  primary: string;
  /** The test that renders the route's states and holds each to the two guards. */
  sweep: string;
}

const HOME = 'test/app/home-screen.test.tsx';
const COUNTRIES = 'src/components/home/__tests__/countries-list.test.tsx';
const TRIPS = 'test/app/trips-screen.test.tsx';
const PROFILE = 'test/app/profile-screen.test.tsx';
const TRIP = 'test/app/trip-screen.test.tsx';
const PHOTOS = 'test/app/photo-screen.test.tsx';
const US2 = 'test/app/us2-screens.test.tsx';
const NOTES = 'test/app/notes-pictured.test.tsx';
const DOCS = 'test/app/document-screens.test.tsx';
const MAPS = 'test/app/offline-maps.test.tsx';
const MODAL = 'test/app/trip-and-modal-screens.test.tsx';
const AUTH = 'test/app/auth-screens.test.tsx';
const WELCOME = 'test/app/welcome-pictured.test.tsx';
const ROOT = 'test/app/root-layout.test.tsx';
const FIRST_SYNC = 'test/components/sync-runtime-first-sync.test.tsx';
const EMPTY_ACTIONS = 'test/state-sweep/empty-actions.test.tsx';
const DENIAL = 'test/state-sweep/permission-denial.test.tsx';
const SWEEP = (name: string) => `test/state-sweep/route-states-${name}.test.tsx`;

export const ROUTE_INVENTORY: readonly RouteRow[] = [
  {
    route: 'src/app/(tabs)/index.tsx',
    loading: {
      shows: 'HomeSkeleton "Loading your globe": a disc and a sheet, no globe mounted',
      pins: [[HOME, 'home-skeleton']],
    },
    empty: {
      shows:
        'the globe with the sheet at zero and "Plan a trip" (a trip with no stop: the "Add a first stop" card); Countries: "No countries yet"',
      pins: [
        [HOME, 'home-plan-trip-fab'],
        [COUNTRIES, 'No countries yet'],
      ],
    },
    error: {
      shows:
        'the globe with ONE plain notice over it, never the raw error (a live query has nothing to retry)',
      pins: [[HOME, 'read your trips']],
    },
    extra: [
      {
        name: 'Countries filter with no match',
        cell: {
          shows: '"No countries match", with "Clear search"',
          pins: [[COUNTRIES, 'No countries match']],
        },
      },
      {
        name: 'offline',
        cell: {
          shows: 'one slim banner and the chip; the globe keeps working',
          pins: [[HOME, 'offline: one chip']],
        },
      },
    ],
    primary: '"Plan a trip" (the button above the pill)',
    sweep: SWEEP('home'),
  },
  {
    route: 'src/app/(tabs)/trips/index.tsx',
    loading: {
      shows: 'TripListSkeleton (hero, ticket, rows), never the empty state',
      pins: [[TRIPS, 'trips-skeleton']],
    },
    empty: {
      shows: '"No trips yet" with "Plan a trip"',
      pins: [[TRIPS, 'trips-empty-plan-trip']],
    },
    error: {
      shows:
        'words and an alert icon, no list and no stale card (no retry: a live query)',
      pins: [[TRIPS, 'read your trips']],
    },
    extra: [
      {
        name: 'Trips filter with no match',
        cell: {
          shows: '"trips-filtered-empty" with "Show all trips"',
          pins: [[TRIPS, 'trips-filter-reset']],
        },
      },
    ],
    primary: '"Plan a trip" (the button above the pill, in every state)',
    sweep: SWEEP('trips'),
  },
  {
    route: 'src/app/(tabs)/profile/index.tsx',
    loading: {
      shows: 'PassportSkeleton "Loading your passport"; the rest of the screen is there',
      pins: [[PROFILE, 'Loading your passport']],
    },
    empty: {
      shows: 'zeros, a ghost stamp, "No stamps yet"',
      pins: [[PROFILE, 'No stamps yet']],
    },
    error: {
      shows:
        'words and an icon, "Your trips are safe on this phone"; Sign out still works',
      pins: [[PROFILE, 'read your passport']],
    },
    primary: 'none: no control on You is primary (FR-005)',
    sweep: SWEEP('profile'),
  },
  {
    route: 'src/app/+not-found.tsx',
    loading: { na: 'a stale link resolves at once; nothing is read' },
    empty: {
      shows: '"This page does not exist" with "Back to your globe"',
      pins: [['test/app/not-found.test.tsx', 'Back to your globe']],
    },
    error: { na: 'this is the error of a stale link' },
    primary: '"Back to your globe"',
    sweep: SWEEP('not-found'),
  },
  {
    route: 'src/app/trip/[id]/index.tsx',
    loading: {
      shows: 'TripDetailSkeleton "Loading trip"; stops: StopsSkeleton',
      pins: [[TRIP, 'trip-skeleton']],
    },
    empty: {
      shows:
        'a trip that is not on this device names the way back ("Back to your trips"); a trip with no stops: a ghost stamp and "Add stop"',
      pins: [
        [TRIP, 'on this device'],
        [EMPTY_ACTIONS, 'trip-missing-back'],
        [TRIP, 'No stops yet'],
      ],
    },
    error: {
      shows: 'words and an icon for the trip and for the stops (no retry: a live query)',
      pins: [
        [TRIP, 'read this trip'],
        [TRIP, 'read the stops'],
      ],
    },
    primary: '"Add stop" (a trip with no stops); none otherwise',
    sweep: SWEEP('trip'),
  },
  {
    route: 'src/app/trip/[id]/photos.tsx',
    loading: {
      shows: 'PhotosSkeleton "Loading photos"',
      pins: [[PHOTOS, 'Loading photos']],
    },
    empty: {
      shows: 'three empty frames, "No photos yet", "Add photos"',
      pins: [[PHOTOS, 'No photos yet']],
    },
    error: {
      shows: 'words, an icon and "Try again" (the list is read again)',
      pins: [[PHOTOS, 'read the photos']],
    },
    extra: [
      {
        name: 'camera permission denied (will not ask again)',
        cell: {
          shows:
            'PermissionState: the camera is off, "Open Settings" (Linking.openSettings), "Dismiss"',
          pins: [
            [PHOTOS, 'Open Settings'],
            [DENIAL, 'photos-camera-denied'],
          ],
        },
      },
    ],
    primary: '"Add photos"',
    sweep: SWEEP('photos'),
  },
  {
    route: 'src/app/trip/[id]/expenses.tsx',
    loading: {
      shows: 'SpendingSkeleton "Loading expenses"',
      pins: [[US2, 'Loading expenses']],
    },
    empty: {
      shows: '"Nothing logged yet" with "Add expense"',
      pins: [[US2, 'Nothing logged yet']],
    },
    error: {
      shows: 'words and an icon (no retry: a live query)',
      pins: [[US2, 'read the expenses']],
    },
    primary: '"Add expense"',
    sweep: SWEEP('areas'),
  },
  {
    route: 'src/app/trip/[id]/notes.tsx',
    loading: {
      shows: 'NotesSkeleton "Loading notes"',
      pins: [[NOTES, 'Loading notes']],
    },
    empty: {
      shows:
        '"No notes yet" (or "No notes for <day> yet" under a filter) with "New note"',
      pins: [[NOTES, 'No notes']],
    },
    error: {
      shows: 'words and an icon (no retry: a live query)',
      pins: [[NOTES, 'read the notes']],
    },
    primary: '"New note"',
    sweep: SWEEP('areas'),
  },
  {
    route: 'src/app/trip/[id]/documents.tsx',
    loading: {
      shows: 'DocumentsSkeleton "Loading documents"',
      pins: [[DOCS, 'Loading documents']],
    },
    empty: {
      shows: '"No documents yet" with "Scan document"',
      pins: [[DOCS, 'No documents yet']],
    },
    error: {
      shows: 'words, an icon and "Try again" (the reader is mounted again)',
      pins: [[DOCS, 'read the documents']],
    },
    primary: '"Scan document"',
    sweep: SWEEP('documents'),
  },
  {
    route: 'src/app/trip/[id]/document-capture.tsx',
    loading: {
      shows: 'LoadingState "Checking camera access"',
      pins: [[DOCS, 'Checking camera access']],
    },
    empty: { na: 'a capture screen has no list; the camera or its explanation fills it' },
    error: {
      shows: 'the scanner and the store apart, each an alert in words (InlineError)',
      pins: [[DOCS, 'document-capture-error']],
    },
    extra: [
      {
        name: 'camera permission not yet allowed',
        cell: {
          shows: '"Allow the camera" with "Allow camera"',
          pins: [[DOCS, 'document-camera-allow']],
        },
      },
      {
        name: 'camera permission denied (will not ask again)',
        cell: {
          shows:
            'PermissionState: the camera is off, "Open Settings" (Linking.openSettings), its one primary',
          pins: [
            [DOCS, 'document-camera-settings'],
            [DENIAL, 'document-camera-denied'],
          ],
        },
      },
    ],
    primary:
      '"Allow camera" / "Open Settings" while the camera cannot start; the shutter once it can',
    sweep: SWEEP('documents'),
  },
  {
    route: 'src/app/trip/[id]/document-view.tsx',
    loading: {
      shows: 'DocumentViewSkeleton "Loading the document" (a card and four rows)',
      pins: [
        [DOCS, 'Loading the document'],
        [EMPTY_ACTIONS, 'document-view-skeleton'],
      ],
    },
    empty: {
      shows:
        'a document that is not on this device names the way back ("Back to documents")',
      pins: [
        [DOCS, 'on this device'],
        [EMPTY_ACTIONS, 'document-missing-back'],
      ],
    },
    error: {
      shows: 'words, an icon and "Try again"',
      pins: [[DOCS, 'read the document']],
    },
    primary: 'none: viewing a pass has no primary (FR-005)',
    sweep: EMPTY_ACTIONS,
  },
  {
    route: 'src/app/trip/[id]/offline-maps.tsx',
    loading: {
      shows: 'OfflineMapsSkeleton for the cities, the saved maps and the map engine',
      pins: [[MAPS, 'Checking saved maps']],
    },
    empty: {
      shows:
        '"No cities yet" and "No city can be saved yet" name the way back ("Back to the trip")',
      pins: [
        [MAPS, 'No cities yet'],
        [MAPS, 'No city can be saved yet'],
        [EMPTY_ACTIONS, 'offline-maps-empty-back'],
      ],
    },
    error: {
      shows: 'words and an icon; the saved-map check has "Try again"',
      pins: [
        [MAPS, 'check the saved maps'],
        [MAPS, 'read the trip'],
      ],
    },
    extra: [
      {
        name: 'maps not set up in this build',
        cell: {
          shows: '"Offline maps aren\u2019t available in this build"',
          pins: [[MAPS, 'available in this build']],
        },
      },
    ],
    primary:
      'the pictured New area button, a coming-soon control; Download is per city and secondary',
    sweep: EMPTY_ACTIONS,
  },
  {
    route: 'src/app/modal/add-trip.tsx',
    loading: { na: 'a form on local state; nothing is read first' },
    empty: { na: 'a form, not a list' },
    error: {
      shows: 'field errors and the save error in words (InlineError)',
      pins: [[MODAL, 'add-trip-error']],
    },
    primary: '"Save trip"',
    sweep: SWEEP('areas'),
  },
  {
    route: 'src/app/modal/delete-account.tsx',
    loading: { na: 'a form on local state; nothing is read first' },
    empty: { na: 'a form, not a list' },
    error: {
      shows:
        'the refusal in words (InlineError): wrong password, no connection, anything else',
      pins: [[SWEEP('delete-account'), 'delete-account-error']],
    },
    primary: 'none: "Delete my account" is destructive, Cancel is text',
    sweep: SWEEP('delete-account'),
  },
  {
    route: 'src/app/modal/add-expense.tsx',
    loading: {
      shows: 'LoadingState "Loading trip" with "Close"',
      pins: [[US2, 'Loading trip']],
    },
    empty: {
      shows: 'a trip that is not on this device, with "Close"',
      pins: [[US2, 'add-expense-close']],
    },
    error: {
      shows: 'words and an icon, with "Close"',
      pins: [[US2, 'read this trip']],
    },
    primary: '"Save expense" (the form); "Close" is secondary in the states',
    sweep: SWEEP('areas'),
  },
  {
    route: 'src/app/(auth)/welcome.tsx',
    loading: { na: 'static, signed out; the session is read behind the native splash' },
    empty: { na: 'static: Welcome shows no data, so there is nothing to be empty' },
    error: {
      shows: 'a provider that fails says so in an alert (InlineError)',
      pins: [[WELCOME, 'social-sign-in-error']],
    },
    primary: 'none: Welcome has no coral primary (the three buttons are equals)',
    sweep: SWEEP('gates'),
  },
  {
    route: 'src/app/(auth)/login.tsx',
    loading: {
      shows: '"Signing in\u2026" on a busy button; the social buttons are disabled',
      pins: [[AUTH, 'Signing in']],
    },
    empty: { na: 'a form, not a list' },
    error: {
      shows: 'an error summary and the field errors; the reset link is coming soon',
      pins: [[AUTH, 'login-error']],
    },
    primary: '"Sign in"',
    sweep: SWEEP('gates'),
  },
  {
    route: 'src/app/(auth)/register.tsx',
    loading: {
      shows: 'a busy "Create account"; the social buttons are disabled',
      pins: [[AUTH, 'register-error']],
    },
    empty: { na: 'a form, not a list' },
    error: {
      shows: 'an error summary and the field errors',
      pins: [[AUTH, 'register-error']],
    },
    primary: '"Create account"',
    sweep: SWEEP('gates'),
  },
  {
    route: 'src/components/require-local-store.tsx',
    loading: {
      shows: 'LoadingState "Opening your trips" (invisible under the native splash)',
      pins: [[FIRST_SYNC, 'Opening your trips']],
    },
    empty: { na: 'a gate: it opens or it fails' },
    error: {
      shows: '"Couldn\u2019t open your trips" with "Try again"; nothing is lost',
      pins: [[ROOT, 'local-store-error']],
    },
    primary: 'none: "Try again" is secondary (FR-005)',
    sweep: SWEEP('gates'),
  },
  {
    route: 'src/components/sync/first-sync-gate.tsx',
    loading: {
      shows: 'LoadingState while the first snapshot arrives, with no invented progress',
      pins: [[FIRST_SYNC, 'first-sync-state']],
    },
    empty: { na: 'a gate: the tabs take its place the moment the first sync is done' },
    error: {
      shows:
        'offline: connect to load your trips, "Try again"; failed: calm words, "Try again"',
      pins: [[FIRST_SYNC, 'Try again']],
    },
    primary: 'none: "Try again" is secondary (FR-005)',
    sweep: SWEEP('gates'),
  },
];

/** Route files that are layouts: they draw no state of their own, their gates are rows above. */
export const LAYOUT_ROUTES: readonly string[] = [
  'src/app/_layout.tsx',
  'src/app/(auth)/_layout.tsx',
  'src/app/(tabs)/_layout.tsx',
  'src/app/(tabs)/profile/_layout.tsx',
  'src/app/(tabs)/trips/_layout.tsx',
  'src/app/modal/_layout.tsx',
  'src/app/trip/[id]/_layout.tsx',
];

/** Not inventoried: the development gallery. */
export const EXCLUDED_ROUTES: readonly string[] = [
  'src/app/(dev)/_layout.tsx',
  'src/app/(dev)/gallery.tsx',
];
