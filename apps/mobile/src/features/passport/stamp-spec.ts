/**
 * The passport's stamps (feature 005, T556; FR-058, FR-059, FR-084; data-model section 4;
 * research D5-08, D5-17; SC-016).
 *
 * `deriveStamp` is `stampSpec` of the adapter layer (`components/ui/stamp-spec.ts`, which the
 * `Stamp` drawing consumes and so cannot import from `features/`): `h = fnv1a32(ISO2|day)`
 * fixes the shape, ink, tilt, wear and perforation, so a country and the day of its FIRST
 * arrival give the same stamp on every launch and device. This file picks WHICH stamps a
 * period shows, from the countries the local store already summarised (`CountrySummary`):
 *
 *   - one stamp per country that has been reached; a country that is only planned has no stamp
 *     yet, and a country visited again never makes a second one;
 *   - a year keeps the countries FIRST arrived in that year (period membership by first
 *     arrival); All time keeps every stamp;
 *   - newest first, ties by name, so the same order comes back every time;
 *   - the text round the top is the country's name (the store keeps no city name on a stop),
 *     upper case, cut to the stamp limit;
 *   - `recent` marks a stamp earned in the last seven days, for the landing (once per
 *     session, held in memory by the screen: D5-17).
 *
 * Pure: nothing is stored, sent or added to the schema. Visibility: private, local.
 */
import {
  STAMP_INKS,
  STAMP_SHAPES,
  stampLabel,
  stampSpec,
  type StampSpec,
} from '@/components/ui/stamp-spec';
import { addDays } from '@/features/trips/stop-dates';

import type { CountrySummary } from './country-summary';

export { STAMP_INKS, STAMP_SHAPES };

/** The stamp of `iso2` first reached on `firstVisit` (`YYYY-MM-DD`, local day). */
export const deriveStamp = stampSpec;

/** A stamp earned in the last seven days lands once per session. */
export const RECENT_DAYS = 7;

/** `all`, or a year as `'2026'`. */
export type PassportPeriodKey = string;

export interface PassportStamp {
  /** The country's ISO code: one stamp per country, so it is the key. */
  key: string;
  iso2: string;
  name: string;
  /** `YYYY-MM-DD`, the first arrival. */
  firstVisit: string;
  spec: StampSpec;
  /** What the parent of the (decorative) stamp says: "Stamp: Portugal, 12 October 2026". */
  label: string;
  /** Earned in the last seven days. */
  recent: boolean;
}

const nameOrder = new Intl.Collator();

/** Today and the six days before it; a day to come is never "earned". */
export function earnedRecently(firstVisit: string, today: string): boolean {
  return firstVisit <= today && firstVisit >= addDays(today, 1 - RECENT_DAYS);
}

function inPeriod(summary: CountrySummary, period: PassportPeriodKey): boolean {
  return period === 'all' || summary.firstVisit.slice(0, 4) === period;
}

export function passportStamps(
  summaries: readonly CountrySummary[],
  period: PassportPeriodKey,
  today: string,
): PassportStamp[] {
  return summaries
    .filter((summary) => !summary.planned && inPeriod(summary, period))
    .sort(
      (a, b) =>
        b.firstVisit.localeCompare(a.firstVisit) || nameOrder.compare(a.name, b.name),
    )
    .map((summary) => ({
      key: summary.iso2,
      iso2: summary.iso2,
      name: summary.name,
      firstVisit: summary.firstVisit,
      spec: deriveStamp(summary.iso2, summary.firstVisit, summary.name),
      label: stampLabel(summary.name, summary.firstVisit),
      recent: earnedRecently(summary.firstVisit, today),
    }));
}
