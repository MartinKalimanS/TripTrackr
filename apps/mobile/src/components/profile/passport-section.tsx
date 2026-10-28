/**
 * The passport part of the You screen (feature 005, F13, T557; FR-058, FR-059, FR-064, FR-084;
 * UI-SPEC section 8): the period switch, the passport card, the recap entry and the stamps page,
 * for the period in view. All of it is derived on the device from the local store (`usePassport`
 * rows through `passportTotals` and `passportStamps`): nothing is stored, sent or invented.
 *
 * The period is component state (All time at first) and is forgotten with the screen; if the year
 * in view stops having a trip it falls back to All time. Every state is designed: shapes while the
 * store has not answered, words and an icon when it could not be read (the rest of the screen,
 * Sign out included, still works), and ghost stamps in the stamps page when there is no country.
 */
import { useMemo, useState } from 'react';

import { ErrorState } from '@/components/ui/state-view';
import { passportTotals } from '@/features/passport/passport-totals';
import { passportStamps } from '@/features/passport/stamp-spec';
import type { PassportData } from '@/features/passport/use-passport';

import { PassportCard } from './passport-card';
import { PassportSkeleton } from './passport-skeleton';
import { PeriodSwitch } from './period-switch';
import { RecapEntry } from './recap-entry';
import { StampsPage } from './stamps-page';

export interface PassportSectionProps {
  data: PassportData;
  loading: boolean;
  error: Error | null;
  /** The traveller's display name, for the card's machine-readable strip. */
  holder: string;
  /** Today, `YYYY-MM-DD`: what "the last seven days" and "this year" mean. */
  today: string;
}

export function PassportSection({
  data,
  loading,
  error,
  holder,
  today,
}: PassportSectionProps) {
  const [chosen, setChosen] = useState('all');
  const period = data.periods.includes(chosen) ? chosen : 'all';
  const totals = useMemo(
    () => passportTotals(data.trips, data.summaries, period),
    [data.trips, data.summaries, period],
  );
  const stamps = useMemo(
    () => passportStamps(data.summaries, period, today),
    [data.summaries, period, today],
  );

  if (error !== null) {
    return (
      <ErrorState
        testID="passport-error"
        title="Couldn’t read your passport"
        detail="Your trips are safe on this phone."
      />
    );
  }
  if (loading) return <PassportSkeleton />;
  return (
    <>
      <PeriodSwitch periods={data.periods} selected={period} onSelect={setChosen} />
      <PassportCard totals={totals} holder={holder} />
      <RecapEntry period={period} thisYear={Number(today.slice(0, 4))} />
      <StampsPage stamps={stamps} period={period} />
    </>
  );
}
