/**
 * Mapbox start-up — research D-30.
 *
 * The public token is read from `EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`, written out
 * in full so Expo inlines it at build time
 * (https://docs.expo.dev/guides/environment-variables.md). It is public by
 * design — restricted to the app's bundle id on the Mapbox account
 * (docs/release/store-readiness.md).
 *
 * Start-up runs once and in a fixed order, and no map mounts until it has
 * finished (`hooks/use-mapbox-ready.ts`):
 *   1. the token is handed to the SDK — a map view created without one
 *      refuses to start;
 *   2. Mapbox telemetry is switched off, so the privacy policy's Mapbox row —
 *      tile requests only — stays true. On iOS this sets the
 *      `MGLMapboxMetricsEnabled` user default the SDK honours; on Android it
 *      goes through a map view's attribution delegate, which is also why it
 *      must follow the token. The session "turnstile" Mapbox bills by is not
 *      telemetry and is sent regardless (mapbox-maps-ios#1964);
 *   3. a wipe of the offline maps that a sign-out recorded but did not see
 *      through — the app closed part-way — is finished (`clearOfflineMaps`).
 *
 * A failure to set the token is reported and leaves the map unavailable; a
 * failure to switch telemetry off, or to finish a wipe, is reported but does
 * not take the globe away — telemetry carries no traveller data, a wipe stays
 * recorded, and the next launch tries again.
 */
import Mapbox from '@rnmapbox/maps';

import {
  clearOfflineMapsWipePending,
  isOfflineMapsWipePending,
  markOfflineMapsWipePending,
} from '@/lib/secure-store';
import { Sentry } from '@/lib/sentry';

let setup: Promise<boolean> | null = null;
let ready = false;

export function mapboxAccessToken(): string | null {
  const token = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
  return token ? token : null;
}

async function start(token: string): Promise<boolean> {
  try {
    await Mapbox.setAccessToken(token);
  } catch (error) {
    Sentry.captureException(error);
    setup = null;
    return false;
  }
  try {
    Mapbox.setTelemetryEnabled(false);
  } catch (error) {
    Sentry.captureException(error);
  }
  await finishRecordedWipe();
  ready = true;
  return true;
}

/**
 * Configure the SDK — once per launch, however many callers ask. Resolves
 * `true` when a map may mount, `false` when the build has no token or the SDK
 * refused it (a refusal is retried by the next call). Never rejects.
 */
export function configureMapbox(): Promise<boolean> {
  const token = mapboxAccessToken();
  if (!token) return Promise.resolve(false);
  setup ??= start(token);
  return setup;
}

/** Whether start-up has already succeeded, so a later mount need not wait. */
export function isMapboxReady(): boolean {
  return ready;
}

/**
 * Delete every saved city, then the ambient (browsing) cache, and count what
 * is left. Pack by pack rather than `resetDatabase`, which both native modules
 * resolve once removal is merely requested (@rnmapbox/maps 10.3.5); Android's
 * `deletePack` waits for the removal, iOS's does not — hence the count.
 */
async function removeOfflineMaps(): Promise<void> {
  const { offlineManager } = Mapbox;
  const packs = await offlineManager.getPacks();
  await Promise.all(packs.map((pack) => offlineManager.deletePack(pack.name)));
  await Mapbox.clearData();
  const left = await offlineManager.getPacks();
  if (left.length > 0) {
    throw new Error(`${left.length} offline map pack(s) remained after the wipe.`);
  }
}

/** Never rejects: a failure is reported and the recorded wipe kept for the next start-up. */
async function wipeOfflineMaps(): Promise<void> {
  try {
    await removeOfflineMaps();
    await clearOfflineMapsWipePending();
  } catch (error) {
    Sentry.captureException(error);
  }
}

/** Start-up: finish a wipe a sign-out recorded but did not see through. */
async function finishRecordedWipe(): Promise<void> {
  const pending = await isOfflineMapsWipePending().catch((error: unknown) => {
    Sentry.captureException(error);
    return false;
  });
  if (pending) await wipeOfflineMaps();
}

/**
 * Forget every offline city on this device, and the browsing cache with it —
 * at sign-out (research D-06, amended 2026-09-29). Mapbox stores packs
 * device-wide, not per account, so the next account to sign in must not find
 * the cities the last one saved. They hold only public tiles, so nothing is
 * lost that a download cannot bring back.
 *
 * Waits for start-up first: the tile store must never be created before the
 * token is set. The wipe is recorded before it begins and forgotten only once
 * confirmed, so one the app closes on, or the store refuses, is finished at
 * the next start-up. Never rejects — a failure is reported and sign-out goes on.
 */
export async function clearOfflineMaps(): Promise<void> {
  if (!mapboxAccessToken()) return;
  const configured = await configureMapbox();
  await markOfflineMapsWipePending().catch((error: unknown) => {
    // Unrecorded, the wipe still runs now; only one cut short goes unfinished.
    Sentry.captureException(error);
  });
  if (configured) await wipeOfflineMaps();
}
