/**
 * The roundel pipeline as a hook — feature 005, T533 (FR-011; research D5-04).
 *
 * Given the pins and the covers it says which pins are roundels and which are dots, and hands
 * back the stage that makes the bitmaps (`roundel-stage.tsx`), to be drawn BESIDE the map.
 * Disabled (`GlobeLayers.pins.roundelsEnabled` false) it does nothing: every pin is a dot,
 * there is no stage and nothing is captured. Enabled, each pin (the live trip first, to about
 * sixty) is wanted as a bitmap, a trip with no photograph as its generated cover; one that is
 * captured becomes a roundel, one that fails stays a dot and is not asked for again (the
 * others keep theirs), one whose cover changes is a new bitmap (the key names the cover) and
 * the old one stops drawing.
 *
 * Memory is bounded: only the bitmaps the current requests name are kept (at most the limit),
 * a file nobody names any more is deleted, and every file is deleted when the hook unmounts.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import {
  captureViewToFile,
  releaseCapturedFile,
  type CaptureView,
} from '@/components/ui/view-capture';
import { GlobeLayers, type GlobeScheme } from '@/constants/theme';

import {
  ROUNDEL_LIMIT,
  roundelRequests,
  splitPins,
  type PinCollection,
  type PinSplit,
  type RoundelRequest,
} from './pin-features';
import { RoundelStage } from './roundel-stage';

export interface RoundelsOptions {
  /** Default `GlobeLayers.pins.roundelsEnabled`: false draws every pin as a dot. */
  enabled?: boolean;
  scheme?: GlobeScheme;
  capture?: CaptureView;
  /** Deletes a captured file nobody needs any more. */
  release?: (uri: string) => void;
  limit?: number;
  /** The country code of each trip's pin, for the generated covers. */
  countries?: Readonly<Record<string, string | null>>;
}

export interface Roundels {
  split: PinSplit;
  /** Bitmap file URIs by name; only those a roundel on screen names are drawn. */
  bitmaps: Readonly<Record<string, string>>;
  /** The off-screen stage to draw beside the map, or null when nothing is being made. */
  stage: ReactElement | null;
}

type ByKey<T> = Readonly<Record<string, T>>;
const NO_COUNTRIES: ByKey<string | null> = {};

function onlyNamed<T>(values: ByKey<T>, requests: readonly RoundelRequest[]): ByKey<T> {
  const named = new Set(requests.map((r) => r.key));
  const kept = Object.entries(values).filter(([key]) => named.has(key));
  return kept.length === Object.keys(values).length ? values : Object.fromEntries(kept);
}

/** Deletes the files of bitmaps no request names, and all of them on unmount. */
function useFileRelease(
  bitmaps: ByKey<string>,
  requests: readonly RoundelRequest[],
  release: (uri: string) => void,
): void {
  const files = useRef<ByKey<string>>({});
  useEffect(() => {
    const named = new Set(requests.map((r) => r.key));
    for (const [key, uri] of Object.entries(files.current)) {
      if (!named.has(key) && bitmaps[key] !== uri) release(uri);
    }
    files.current = bitmaps;
  }, [bitmaps, requests, release]);
  useEffect(
    () => () => {
      for (const uri of Object.values(files.current)) release(uri);
    },
    [release],
  );
}

export function useRoundels(
  pins: PinCollection,
  covers: ByKey<string>,
  {
    enabled = GlobeLayers.pins.roundelsEnabled,
    scheme = 'light',
    capture = captureViewToFile,
    release = releaseCapturedFile,
    limit = ROUNDEL_LIMIT,
    countries = NO_COUNTRIES,
  }: RoundelsOptions = {},
): Roundels {
  const requests = useMemo(
    () => (enabled ? roundelRequests(pins, covers, limit, scheme, countries) : []),
    [enabled, pins, covers, limit, scheme, countries],
  );
  const [made, setMade] = useState<ByKey<string>>({});
  const [failed, setFailed] = useState<ByKey<true>>({});
  const names = requests.map((r) => r.key).join('|');
  const [seen, setSeen] = useState(names);
  if (seen !== names) {
    // Forget what the new requests no longer name (a changed cover, the other theme). The
    // test is on the NAMES, so inputs rebuilt on every render cannot loop.
    setSeen(names);
    setMade(onlyNamed(made, requests));
    setFailed(onlyNamed(failed, requests));
  }
  const bitmaps = useMemo(() => onlyNamed(made, requests), [made, requests]);
  useFileRelease(bitmaps, requests, release);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const onCaptured = useCallback(
    (key: string, uri: string) => {
      if (alive.current) setMade((previous) => ({ ...previous, [key]: uri }));
      else release(uri);
    },
    [release],
  );
  const onFailed = useCallback(
    (key: string) => setFailed((previous) => ({ ...previous, [key]: true })),
    [],
  );

  const split = useMemo(
    () => splitPins(pins, requests, bitmaps),
    [pins, requests, bitmaps],
  );
  const pending = requests.filter((r) => !(r.key in bitmaps) && !(r.key in failed));
  const stage =
    pending.length > 0 ? (
      <RoundelStage
        requests={pending}
        scheme={scheme}
        capture={capture}
        onCaptured={onCaptured}
        onFailed={onFailed}
      />
    ) : null;

  return { split, bitmaps, stage };
}
