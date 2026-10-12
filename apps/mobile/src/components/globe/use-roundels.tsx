/**
 * The roundel pipeline as a hook — feature 005, T533 (FR-011; research D5-04).
 *
 * Given the pins and the covers it says which pins are roundels and which are dots, and hands
 * back the stage that makes the bitmaps (`roundel-stage.tsx`), to be drawn BESIDE the map.
 * Disabled (the default, `GlobeLayers.pins.roundelsEnabled`) it does nothing: every pin is a
 * dot, there is no stage and nothing is captured. Enabled, each pin with a cover (the live
 * trip first, to about sixty) is wanted as a bitmap; one that is captured becomes a roundel,
 * one that fails stays a dot and is not asked for again, one whose cover changes is a new
 * bitmap (the key names the cover) and the old one stops drawing.
 */
import { useCallback, useMemo, useState, type ReactElement } from 'react';

import { captureViewToFile, type CaptureView } from '@/components/ui/view-capture';
import { GlobeLayers, type GlobeScheme } from '@/constants/theme';

import {
  ROUNDEL_LIMIT,
  roundelRequests,
  splitPins,
  type PinCollection,
  type PinSplit,
} from './pin-features';
import { RoundelStage } from './roundel-stage';

export interface RoundelsOptions {
  /** Default `GlobeLayers.pins.roundelsEnabled`: off until the device check passes. */
  enabled?: boolean;
  scheme?: GlobeScheme;
  capture?: CaptureView;
  limit?: number;
}

export interface Roundels {
  split: PinSplit;
  /** Bitmap file URIs by name; only those a roundel on screen names are drawn. */
  bitmaps: Readonly<Record<string, string>>;
  /** The off-screen stage to draw beside the map, or null when nothing is being made. */
  stage: ReactElement | null;
}

export function useRoundels(
  pins: PinCollection,
  covers: Readonly<Record<string, string>>,
  {
    enabled = GlobeLayers.pins.roundelsEnabled,
    scheme = 'light',
    capture = captureViewToFile,
    limit = ROUNDEL_LIMIT,
  }: RoundelsOptions = {},
): Roundels {
  const [bitmaps, setBitmaps] = useState<Readonly<Record<string, string>>>({});
  const [failed, setFailed] = useState<Readonly<Record<string, true>>>({});
  const onCaptured = useCallback(
    (key: string, uri: string) => setBitmaps((previous) => ({ ...previous, [key]: uri })),
    [],
  );
  const onFailed = useCallback(
    (key: string) => setFailed((previous) => ({ ...previous, [key]: true })),
    [],
  );

  const requests = useMemo(
    () => (enabled ? roundelRequests(pins, covers, limit, scheme) : []),
    [enabled, pins, covers, limit, scheme],
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
