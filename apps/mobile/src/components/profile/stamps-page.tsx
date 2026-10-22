/**
 * `StampsPage` - the passport's visa page (feature 005, F13, T557, T558 for the landing; FR-058,
 * FR-059, FR-060, FR-076, FR-084; UI-SPEC sections 3.9 and 8; research D5-08; Q-2; the pictures
 * `profile.png`, `profile-dark.png`; prototype `styles.css` `.visa`, `.stamps`, `.stamp-cell`).
 *
 * A cream page (`surfaceSecondary` with a hairline, radius 24, padding 20 16 24) with the
 * paper-coloured notch at its top right corner. The heading row is `headline` "Stamps" and a
 * `caption` `muted` "14 of 195" (195 is the fixed reference of Q-2; the numerator is the number
 * of stamps shown). The stamps are two columns of 124 dp stamps, 8 apart, 4 between rows, the
 * second column 20 dp lower; each cell is ONE announced image named "Stamp: Portugal, 12
 * October 2026" (the stamp itself is decoration, FR-076) with the country's name under it.
 *
 * - A stamp earned in the last seven days lands once per session (`StampIn`, the heavy haptic;
 *   nothing under reduced motion): `stamp-landing.ts` remembers which have landed.
 * - From `STAMP_RASTER_FROM` (100) stamps each one is baked to a bitmap once (`RasterStamp`) so a
 *   long passport scrolls without two hundred masked SVGs; below it they are vector stamps.
 * - With no stamp the page is not empty of meaning: a ghost stamp and the next step, in words
 *   (an unvisited slot, never an illustration; UI-SPEC section 9.3).
 *
 * The stamps are derived from the countries the traveller has been to (`passportStamps`); the
 * page invents none. Privacy: private, local, nothing sent.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useColors } from '@/components/ui/theme-tokens';
import { Stamp, GhostStamp } from '@/components/ui/stamp';
import { StampIn } from '@/components/ui/stamp-in';
import { Text } from '@/components/ui/text';
import { stampsCount } from '@/features/passport/passport-copy';
import type { PassportStamp } from '@/features/passport/stamp-spec';
import { useAppearance } from '@/hooks/use-appearance';
import { deviceLocale } from '@/lib/locale';
import { Radii, Space } from '@/theme';

import { RasterStamp } from './raster-stamp';
import { hasLanded, markLanded } from './stamp-landing';

/** The side of a stamp on the page, in dp. */
export const STAMP_SIZE = 124;
/** From this many stamps each is baked to a bitmap; below it they are vector. */
export const STAMP_RASTER_FROM = 100;
/** The second column sits this much lower. */
export const SECOND_COLUMN_OFFSET = Space[5];

const COLORS = ['surfaceSecondary', 'hairline'] as const;

function StampCell({ stamp, raster }: { stamp: PassportStamp; raster: boolean }) {
  const [play] = useState(() => stamp.recent && !hasLanded(stamp.iso2, stamp.firstVisit));
  useEffect(() => {
    if (stamp.recent) markLanded(stamp.iso2, stamp.firstVisit);
  }, [stamp.iso2, stamp.firstVisit, stamp.recent]);

  const art = raster ? (
    <RasterStamp spec={stamp.spec} size={STAMP_SIZE} testID={`stamp-art-${stamp.key}`} />
  ) : (
    <Stamp spec={stamp.spec} size={STAMP_SIZE} testID={`stamp-art-${stamp.key}`} />
  );
  return (
    <View
      testID={`stamp-${stamp.key}`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={stamp.label}
      className="min-w-0 items-center justify-center">
      <StampIn
        play={play}
        tiltDeg={stamp.spec.rotationDeg}
        testID={`stamp-in-${stamp.key}`}>
        {art}
      </StampIn>
      <Text
        variant="caption"
        tone="muted"
        className="text-center"
        style={{ marginTop: -4 }}>
        {stamp.name}
      </Text>
    </View>
  );
}

function Columns({ stamps }: { stamps: readonly PassportStamp[] }) {
  const raster = stamps.length >= STAMP_RASTER_FROM;
  const columns = [
    stamps.filter((_, index) => index % 2 === 0),
    stamps.filter((_, index) => index % 2 === 1),
  ];
  return (
    <View testID="stamps-grid" style={{ flexDirection: 'row', columnGap: Space[2] }}>
      {columns.map((column, index) => (
        <View
          key={index}
          testID={`stamps-column-${index}`}
          style={{
            flex: 1,
            rowGap: Space[1],
            paddingTop: index === 1 ? SECOND_COLUMN_OFFSET : 0,
          }}>
          {column.map((stamp) => (
            <StampCell key={stamp.key} stamp={stamp} raster={raster} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** What the page says when it has nothing to stamp yet. */
function emptyWords(period: string): { title: string; detail: string } {
  return period === 'all'
    ? {
        title: 'No stamps yet',
        detail: 'Add a stop to a trip and its country is stamped here.',
      }
    : {
        title: `No new stamps in ${period}`,
        detail: 'A country is stamped the first time you arrive.',
      };
}

function Empty({ period }: { period: string }) {
  const { title, detail } = emptyWords(period);
  return (
    <View testID="stamps-empty" className="items-center gap-2 py-4">
      <GhostStamp size={96} rotationDeg={-4} testID="stamps-empty-ghost" />
      <Text variant="callout" className="text-center">
        {title}
      </Text>
      <Text variant="body" tone="muted" className="text-center">
        {detail}
      </Text>
    </View>
  );
}

export interface StampsPageProps {
  stamps: readonly PassportStamp[];
  /** `all` or a year. */
  period: string;
}

export function StampsPage({ stamps, period }: StampsPageProps) {
  const { tokens } = useAppearance();
  const colors = useColors(COLORS);
  return (
    <View
      testID="stamps-page"
      style={{
        backgroundColor: colors.surfaceSecondary,
        borderColor: colors.hairline,
        borderWidth: 1,
        borderRadius: Radii.xl,
        borderCurve: 'continuous',
        paddingTop: Space[5],
        paddingHorizontal: Space[4],
        paddingBottom: Space[6],
        overflow: 'hidden',
      }}>
      <View
        testID="stamps-notch"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          right: -14,
          top: -14,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: tokens.canvas,
          borderWidth: 1,
          borderColor: colors.hairline,
        }}
      />
      <View
        className="flex-row items-baseline justify-between gap-3"
        style={{ marginBottom: Space[3], paddingRight: Space[6] }}>
        <Text variant="headline">Stamps</Text>
        <Text variant="caption" tone="muted" testID="stamps-count">
          {stampsCount(stamps.length, deviceLocale().languageTag)}
        </Text>
      </View>
      {stamps.length === 0 ? <Empty period={period} /> : <Columns stamps={stamps} />}
    </View>
  );
}
