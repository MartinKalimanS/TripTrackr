/**
 * `HomeSheet` - the persistent sheet of the Home (feature 005, T537; contract C5-22 and C5-23;
 * FR-012, FR-014 to FR-017; research D5-03): the `Sheet` adapter filled with the three positions.
 *
 *   <HomeSheet detents={layout.detents} detent={camera.detent} onDetentChange={camera.setDetent}
 *     onSettle={camera.onSettle} tabZone={layout.tabZone} now={now} next={next}
 *     overview={overview} onOpenTrip={...} onOpenTrips={...} onSelectCountry={...} />
 *
 * - **peek**: only the live trip (else the next planned one) as the compact card; with neither,
 *   nothing but the handle.
 * - **half**: the three figures (the countries figure raises the sheet to the Countries list, the
 *   trips figure opens the Trips tab, the kilometres are plain), the live trip and the next
 *   planned trip.
 * - **full**: the Countries list; choosing a country lowers the sheet to half and flies the globe
 *   there (the Home's), and the collapse control lowers it to half too.
 *
 * Half starts with the sync banner when there is one (`banner`, the screen's `SyncStatusBanner`).
 * Peek and half are padded 20 dp at the sides and end above the tab pill (the tab zone plus 16 dp),
 * so nothing sits behind it (FR-024); the list pads itself. The handle is the sheet's own: an
 * `adjustable` control named "Countries and trips" with "Peek", "Half" or "Full" as its value and
 * "More" and "Less" as its actions (FR-017), and Android's back gesture steps it down a detent
 * before it leaves the screen. What is shown follows the detent the sheet is GOING to, so the
 * content changes as it springs, never before the finger lets go.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Sheet, type SheetDetent, type SheetHeights } from '@/components/ui/sheet';
import type { HomeTrips } from '@/features/home/home-trips';
import type { CountrySummary } from '@/features/passport/country-summary';
import type { CountryOverview } from '@/features/passport/use-country-overview';
import { ScreenMargin, Space } from '@/theme';

import { CountriesList } from './countries-list';
import { HomeHalf } from './home-half';
import { HomePeek } from './home-peek';

export interface HomeSheetProps extends HomeTrips {
  detents: SheetHeights;
  detent: SheetDetent;
  onDetentChange: (detent: SheetDetent) => void;
  onSettle: (detent: SheetDetent) => void;
  /** The tab pill's height and offset: the sheet's content ends above it. */
  tabZone: number;
  overview: CountryOverview;
  onOpenTrip: (tripId: string) => void;
  onOpenTrips: () => void;
  onSelectCountry: (country: CountrySummary) => void;
  /** The offline or sync-failed banner: the first thing in the half sheet (`home-offline.png`). */
  banner?: ReactNode;
}

type BodyProps = Omit<HomeSheetProps, 'detents' | 'onDetentChange' | 'onSettle'> & {
  onOpenCountries: () => void;
  onCollapse: () => void;
};

function Body({ detent, tabZone, overview, now, next, banner, ...rest }: BodyProps) {
  if (detent === 'full') {
    return (
      <CountriesList
        overview={overview}
        onSelectCountry={rest.onSelectCountry}
        onCollapse={rest.onCollapse}
        contentInsetBottom={tabZone + Space[4]}
      />
    );
  }
  return (
    <View style={[styles.content, { paddingBottom: tabZone + Space[4] }]}>
      {detent === 'half' ? banner : null}
      {detent === 'half' ? (
        <HomeHalf
          totals={overview.totals}
          now={now}
          next={next}
          onOpenCountries={rest.onOpenCountries}
          onOpenTrips={rest.onOpenTrips}
          onOpenTrip={rest.onOpenTrip}
        />
      ) : (
        <HomePeek now={now} onOpenTrip={rest.onOpenTrip} />
      )}
    </View>
  );
}

export function HomeSheet({
  detents,
  onDetentChange,
  onSettle,
  ...body
}: HomeSheetProps) {
  return (
    <Sheet
      detents={detents}
      detent={body.detent}
      onDetentChange={onDetentChange}
      onSettle={onSettle}
      handleLabel="Countries and trips"
      renderBody={({ detent }) => (
        <Body
          {...body}
          detent={detent}
          onOpenCountries={() => onDetentChange('full')}
          onCollapse={() => onDetentChange('half')}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  // The prototype's `.sheet-body`: 20 at the sides, 16 between the banner and the content.
  content: {
    paddingHorizontal: ScreenMargin.default,
    paddingTop: Space[1],
    gap: Space[4],
  },
});
