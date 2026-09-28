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
 *      telemetry and is sent regardless (mapbox-maps-ios#1964).
 *
 * A failure to set the token is reported and leaves the map unavailable; a
 * failure to switch telemetry off is reported but does not take the globe
 * away — telemetry carries no traveller data, and the next launch tries again.
 */
import Mapbox from '@rnmapbox/maps';

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
