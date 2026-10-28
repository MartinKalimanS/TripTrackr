/**
 * `RasterStamp` - a stamp baked to a bitmap once (feature 005, F13, T557; research D5-08: "for
 * long passports (100 or more stamps) a stamp is rasterised once per (shape, code, date) into the
 * cache with `view-shot` and drawn with `expo-image`").
 *
 * A vector `Stamp` is an SVG with a mask of about 170 holes and curved text: fine for a dozen,
 * heavy for two hundred in a scroller. This draws the same stamp as a picture. The first time a
 * stamp is on screen it takes a slot (`raster-queue.ts`, three at a time), lays the vector stamp
 * out UNTILTED, captures it to a PNG (`captureViewToFile`, the one view-shot door), keeps the file
 * in a module cache keyed by what makes the stamp look as it does, and from then on draws that
 * picture, tilted by the stamp's own degrees and multiplied into the page in the light themes as
 * the vector one is. Until then a blank square holds its place, so nothing jumps. A capture that
 * fails leaves the vector stamp in place: a stamp is never missing. Decorative like `Stamp`
 * (FR-076): the cell that holds it carries the meaning.
 *
 * Whether a hidden view captures with the right colour and transparency on both platforms is a
 * device check (V2/V5): `STAMP_RASTER_FROM` in `stamps-page.tsx` is the one switch back to
 * vector stamps.
 */
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Stamp } from '@/components/ui/stamp';
import type { StampSpec } from '@/components/ui/stamp-spec';
import { captureViewToFile } from '@/components/ui/view-capture';
import { useAppearance } from '@/hooks/use-appearance';

import { acquireSlot } from './raster-queue';

const DECORATIVE = {
  pointerEvents: 'none',
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

const cache = new Map<string, string>();

/** What makes a baked stamp look as it does: the spec, the size and the theme's inks. */
export function rasterKey(spec: StampSpec, size: number, themeName: string): string {
  const { shape, ink, wear, perforated, iso2, top, date } = spec;
  return [themeName, size, shape, ink, wear, perforated, iso2, top, date].join('|');
}

/** For tests: how many stamps are baked. */
export function rasterCacheSize(): number {
  return cache.size;
}

/** For tests: forget every baked stamp. */
export function clearRasterCache(): void {
  cache.clear();
}

export interface RasterStampProps {
  spec: StampSpec;
  size: number;
  /** Default `stamp-raster`. */
  testID?: string;
}

type Phase = 'waiting' | 'capturing' | 'failed' | 'done';

/** Where one stamp (one key) is: its phase, and the file once it is baked. */
interface Progress {
  key: string;
  phase: Exclude<Phase, 'waiting'>;
  uri?: string;
}

export function RasterStamp({ spec, size, testID = 'stamp-raster' }: RasterStampProps) {
  const { theme, themeName } = useAppearance();
  const key = rasterKey(spec, size, themeName);
  const [progress, setProgress] = useState<Progress | null>(null);
  const stage = useRef<View>(null);
  const slot = useRef<(() => void) | null>(null);

  const mine = progress?.key === key ? progress : null;
  const uri = cache.get(key) ?? mine?.uri;
  const phase: Phase = uri === undefined ? (mine?.phase ?? 'waiting') : 'done';

  useEffect(() => {
    if (cache.has(key)) return undefined;
    let alive = true;
    acquireSlot().then((give) => {
      if (!alive) {
        give();
        return;
      }
      slot.current = give;
      setProgress({ key, phase: 'capturing' });
    });
    return () => {
      alive = false;
      slot.current?.();
      slot.current = null;
    };
  }, [key]);

  const finish = (next: Progress) => {
    slot.current?.();
    slot.current = null;
    setProgress(next);
  };

  const capture = () => {
    if (phase !== 'capturing') return;
    captureViewToFile(stage).then(
      (file) => {
        cache.set(key, file);
        finish({ key, phase: 'done', uri: file });
      },
      () => finish({ key, phase: 'failed' }),
    );
  };

  const tilt = { transform: [{ rotate: `${spec.rotationDeg}deg` }] } as const;
  if (uri !== undefined) {
    return (
      <View
        {...DECORATIVE}
        style={[
          {
            width: size,
            height: size,
            mixBlendMode: theme === 'light' ? 'multiply' : 'normal',
          },
          tilt,
        ]}>
        <Image
          testID={testID}
          source={{ uri }}
          contentFit="contain"
          transition={0}
          {...DECORATIVE}
          style={{ width: size, height: size }}
        />
      </View>
    );
  }
  const drawn = phase === 'capturing' || phase === 'failed';
  return (
    <View
      testID={`${testID}-${drawn ? 'stage' : 'placeholder'}`}
      {...DECORATIVE}
      style={[{ width: size, height: size }, phase === 'failed' ? null : tilt]}>
      {drawn ? (
        <View ref={stage} collapsable={false} onLayout={capture}>
          <Stamp
            testID={`${testID}-vector`}
            spec={phase === 'failed' ? spec : { ...spec, rotationDeg: 0 }}
            size={size}
          />
        </View>
      ) : null}
    </View>
  );
}
