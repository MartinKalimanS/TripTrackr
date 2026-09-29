/**
 * Offline map packs for a trip's cities — tasks.md T105 (FR-044; User Story 4,
 * Acceptance Scenarios 3 and 4); research D-06.
 *
 * The screen hands this hook the trip's placeable cities. On mount it reads
 * what the device already holds; `download` saves a city's map and `remove`
 * deletes it, through Mapbox's `offlineManager` (@rnmapbox/maps 10.3.5, over
 * the Maps SDK v11 tile store). The pure half — names, bounds, words — is
 * offline-packs.ts.
 *
 * A download carries on when the screen closes. The hook listens only while
 * it is mounted and listens again when it comes back; it never leaves a city
 * "downloading" once the SDK has reported a failure.
 *
 * Privacy posture (Constitution I), as offline-packs.ts states it: public
 * tiles, a public city id and name, kept on this device only. Nothing here
 * reaches the TripTrackr API. A download that fails because of the network,
 * the disk or Mapbox's quota is the traveller's circumstance, and is shown
 * rather than reported; a call the SDK itself rejects is both.
 */
import { offlineManager } from '@rnmapbox/maps';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { Sentry } from '@/lib/sentry';

import {
  OFFLINE_PACK_COPY,
  cityIdOfPack,
  cityPackOptions,
  describePackError,
  isAlreadyExists,
  packName,
  packProgress,
  type OfflineCity,
  type OfflinePackState,
  type PackProgress,
} from './offline-packs';

type CreatePack = typeof offlineManager.createPack;
type ProgressListener = Parameters<CreatePack>[1];
type ErrorListener = NonNullable<Parameters<CreatePack>[2]>;

type PackStates = Readonly<Record<number, OfflinePackState>>;
type Update = (cityId: number, next: OfflinePackState) => void;

/** The packs one mounted screen listens to. Closed when it unmounts. */
interface Listening {
  open: boolean;
  names: Set<string>;
}

export interface OfflinePacks {
  /** The device's packs have not been read yet — distinct from "none saved". */
  loading: boolean;
  /** Reading them failed; `retry` reads them again. */
  error: Error | null;
  retry: () => void;
  stateOf: (cityId: number) => OfflinePackState;
  /** Never rejects: a failure becomes the city's `error` state. */
  download: (city: OfflineCity) => Promise<void>;
  /** Never rejects: a failure becomes the city's `error` state. */
  remove: (city: OfflineCity) => Promise<void>;
}

const NONE: OfflinePackState = { kind: 'none' };
const STARTING: OfflinePackState = { kind: 'downloading', percent: 0 };

/**
 * Packs this JS runtime has started or resumed and not yet seen end. A pack
 * incomplete on disk but missing from here was cut off by the app closing:
 * nothing is downloading it, so the screen says it stopped and offers Try
 * again — never a download that will not move.
 */
const inFlight = new Set<string>();

/**
 * The SDK keeps ONE listener pair per pack name, so this records whose it
 * holds: a screen closing must not silence the newer one that took over.
 */
const owners = new Map<string, Listening>();

/**
 * One operation at a time per pack: a Remove tapped while the pack is being
 * created deletes what the create made, and a Download tapped during a
 * removal starts afresh once the removal is done.
 */
const queues = new Map<string, Promise<void>>();

function enqueue(name: string, task: () => Promise<void>): Promise<void> {
  const next = (queues.get(name) ?? Promise.resolve())
    .then(task)
    .catch((error: unknown) => {
      Sentry.captureException(error);
    });
  queues.set(name, next);
  return next;
}

/** Stop listening to a pack — unless a newer screen has taken it over. */
function release(listening: Listening, name: string): void {
  listening.names.delete(name);
  if (owners.get(name) !== listening) return;
  owners.delete(name);
  offlineManager.unsubscribe(name);
}

function closeListening(listening: Listening): void {
  listening.open = false;
  for (const name of [...listening.names]) release(listening, name);
}

function progressState(progress: PackProgress): OfflinePackState {
  return progress.complete
    ? { kind: 'ready', bytes: progress.bytes }
    : { kind: 'downloading', percent: progress.percent };
}

/**
 * A setter for one city's state that returns the same object when nothing
 * changed, so React skips the render: the Android module sends every native
 * progress event unthrottled, most of them the same whole percent.
 */
function updater(setStates: Dispatch<SetStateAction<PackStates>>): Update {
  return (cityId, next) =>
    setStates((current) => {
      const previous = current[cityId];
      const same =
        previous !== undefined && JSON.stringify(previous) === JSON.stringify(next);
      return same ? current : { ...current, [cityId]: next };
    });
}

function packListeners(
  cityId: number,
  name: string,
  listening: Listening,
  update: Update,
): { onProgress: ProgressListener; onError: ErrorListener } {
  return {
    onProgress: (_pack, status) => {
      const progress = packProgress(status);
      if (progress.complete) {
        inFlight.delete(name);
        release(listening, name);
      }
      update(cityId, progressState(progress));
    },
    onError: (_pack, error) => {
      // The attempt is over: stop listening, so no late event can revive it.
      inFlight.delete(name);
      release(listening, name);
      update(cityId, { kind: 'error', message: describePackError(error), partial: true });
    },
  };
}

function listenTo(
  listening: Listening,
  cityId: number,
  name: string,
  update: Update,
): Promise<void> {
  const { onProgress, onError } = packListeners(cityId, name, listening, update);
  owners.set(name, listening);
  listening.names.add(name);
  return offlineManager.subscribe(name, onProgress, onError);
}

/** `createPack` hands the SDK this screen's listeners as it begins; keep them only while open. */
function claim(listening: Listening, name: string): void {
  const owner = owners.get(name);
  if (owner !== undefined && owner !== listening) return;
  if (listening.open) {
    owners.set(name, listening);
    listening.names.add(name);
    return;
  }
  owners.delete(name);
  offlineManager.unsubscribe(name);
}

interface Existing {
  cityId: number;
  name: string;
  /** This runtime is already downloading it: listen, do not start a second load. */
  wasInFlight: boolean;
}

/**
 * "Already exists": a pack another screen finished, one still downloading,
 * or the saved part of one that failed or was cut off. Listen to it, and
 * resume it unless it is already loading — a second load would cancel the
 * first, and the cancellation would arrive as an error.
 */
async function continueExisting(
  { cityId, name, wasInFlight }: Existing,
  listening: Listening,
  update: Update,
): Promise<void> {
  try {
    const pack = await offlineManager.getPack(name);
    if (!pack) throw new Error(`Offline pack ${name} vanished before it could resume.`);
    const progress = packProgress(await pack.status());
    if (progress.complete) {
      inFlight.delete(name);
      update(cityId, progressState(progress));
      return;
    }
    if (listening.open) await listenTo(listening, cityId, name, update);
    update(cityId, progressState(progress));
    if (!wasInFlight) await pack.resume();
  } catch (error) {
    // A load already running before this call is still running: keep it known,
    // so Try again listens to it rather than resuming (and cancelling) it.
    if (!wasInFlight) inFlight.delete(name);
    release(listening, name);
    Sentry.captureException(error);
    update(cityId, { kind: 'error', message: describePackError(error), partial: true });
  }
}

function failedToStart(
  cityId: number,
  name: string,
  error: unknown,
  update: Update,
): void {
  inFlight.delete(name);
  // The SDK subscribes before the native side answers; nothing may stay behind.
  if (!owners.has(name)) offlineManager.unsubscribe(name);
  Sentry.captureException(error);
  update(cityId, { kind: 'error', message: describePackError(error), partial: false });
}

async function startDownload(
  city: OfflineCity,
  listening: Listening,
  update: Update,
): Promise<void> {
  const name = packName(city.cityId);
  const existing = { cityId: city.cityId, name, wasInFlight: inFlight.has(name) };
  const { onProgress, onError } = packListeners(city.cityId, name, listening, update);
  update(city.cityId, STARTING);
  inFlight.add(name);
  try {
    await offlineManager.createPack(cityPackOptions(city), onProgress, onError);
  } catch (error) {
    if (isAlreadyExists(error)) await continueExisting(existing, listening, update);
    else failedToStart(city.cityId, name, error, update);
    return;
  }
  claim(listening, name);
}

async function removePack(
  cityId: number,
  listening: Listening,
  update: Update,
): Promise<void> {
  const name = packName(cityId);
  // Unsubscribe FIRST: removing a tile region cancels its pending load, and
  // that cancellation arrives as an error event nobody should see.
  owners.delete(name);
  listening.names.delete(name);
  inFlight.delete(name);
  offlineManager.unsubscribe(name);
  try {
    await offlineManager.deletePack(name);
    update(cityId, NONE);
  } catch (error) {
    Sentry.captureException(error);
    update(cityId, {
      kind: 'error',
      message: OFFLINE_PACK_COPY.removeFailed,
      partial: true,
    });
  }
}

interface FoundPack {
  cityId: number;
  name: string;
  /** Null when the pack's status could not be read. */
  progress: PackProgress | null;
}

/** The device's packs for these cities. Packs this app did not name are left alone. */
async function findCityPacks(cityIds: ReadonlySet<number>): Promise<FoundPack[]> {
  const packs = await offlineManager.getPacks();
  const found = await Promise.all(
    packs.map(async (pack): Promise<FoundPack | null> => {
      const cityId = cityIdOfPack(pack.name as unknown);
      if (cityId === null || !cityIds.has(cityId)) return null;
      const progress = await pack.status().then(packProgress, (error: unknown) => {
        Sentry.captureException(error);
        return null;
      });
      return { cityId, name: packName(cityId), progress };
    }),
  );
  return found.filter((entry): entry is FoundPack => entry !== null);
}

const UNREADABLE: OfflinePackState = {
  kind: 'error',
  message: OFFLINE_PACK_COPY.unreadable,
  partial: true,
};
const INTERRUPTED: OfflinePackState = {
  kind: 'error',
  message: OFFLINE_PACK_COPY.interrupted,
  partial: true,
};

function stateOnMount({ name, progress }: FoundPack): OfflinePackState {
  if (!progress) return UNREADABLE;
  if (progress.complete || inFlight.has(name)) return progressState(progress);
  return INTERRUPTED;
}

/**
 * A found pack's state. One this runtime is still downloading is listened to
 * again — and settled before the states are shown, so a failure to listen
 * becomes words rather than a download that never moves.
 */
async function settleOnMount(
  found: FoundPack,
  listening: Listening,
  update: Update,
): Promise<[number, OfflinePackState]> {
  const state = stateOnMount(found);
  if (state.kind !== 'downloading') return [found.cityId, state];
  try {
    await listenTo(listening, found.cityId, found.name, update);
    return [found.cityId, state];
  } catch (error) {
    release(listening, found.name);
    Sentry.captureException(error);
    return [
      found.cityId,
      { kind: 'error', message: describePackError(error), partial: true },
    ];
  }
}

interface Loaded {
  states: PackStates;
  error: Error | null;
}

async function loadCityPacks(
  cityIds: ReadonlySet<number>,
  listening: Listening,
  update: Update,
  isCurrent: () => boolean,
): Promise<Loaded | null> {
  try {
    const found = await findCityPacks(cityIds);
    if (!isCurrent()) return null;
    const settled = await Promise.all(
      found.map((entry) => settleOnMount(entry, listening, update)),
    );
    return { states: Object.fromEntries(settled), error: null };
  } catch (error) {
    Sentry.captureException(error);
    return {
      states: {},
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function parseIds(idsKey: string): ReadonlySet<number> {
  return new Set(idsKey === '' ? [] : idsKey.split(',').map(Number));
}

/** Save, watch and remove the offline maps of these cities (FR-044). */
export function useOfflinePacks(cities: readonly OfflineCity[]): OfflinePacks {
  const idsKey = cities.map((city) => city.cityId).join(',');
  const [attempt, setAttempt] = useState(0);
  const [states, setStates] = useState<PackStates>({});
  const [loaded, setLoaded] = useState<{ key: string; error: Error | null } | null>(null);
  const listeningRef = useRef<Listening>({ open: true, names: new Set() });
  const requestKey = `${idsKey}#${attempt}`;

  useEffect(() => {
    let current = true;
    const listening = listeningRef.current;
    listening.open = true;
    const load = loadCityPacks(
      parseIds(idsKey),
      listening,
      updater(setStates),
      () => current,
    );
    void load.then((result) => {
      if (!current || !result) return;
      setStates(result.states);
      setLoaded({ key: requestKey, error: result.error });
    });
    return () => {
      current = false;
      closeListening(listening);
    };
  }, [idsKey, requestKey]);

  const update = updater(setStates);
  const settled = loaded?.key === requestKey ? loaded : null;

  return {
    loading: settled === null,
    error: settled?.error ?? null,
    retry: () => setAttempt((count) => count + 1),
    stateOf: (cityId) => states[cityId] ?? NONE,
    download: (city) => {
      update(city.cityId, STARTING);
      const name = packName(city.cityId);
      return enqueue(name, () => startDownload(city, listeningRef.current, update));
    },
    remove: (city) => {
      update(city.cityId, NONE);
      const name = packName(city.cityId);
      return enqueue(name, () => removePack(city.cityId, listeningRef.current, update));
    },
  };
}
