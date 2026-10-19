/**
 * What the Home is laid out from (feature 005, T537; FR-012, FR-013; contract C5-22): the
 * window, the insets, the tab pill's zone, the three heights of the sheet and where the header
 * zone ends once it has been laid out.
 *
 *   const layout = useHomeLayout();
 *   <HomeHeader onMeasured={layout.setHeaderBottom} />
 *   <Sheet detents={layout.detents} ... />
 *
 * `headerBottom` is `null` until the header has been laid out: the globe is fitted under that
 * edge, so the map mounts only once it is known and its first frame is already in place (no
 * guessed height to correct, no animation on first draw). The heights are `sheetHeights()` of
 * the window, the insets, the tab zone and the peek row at the current text size
 * (`peekRowHeight`), memoised on the numbers so a re-render does not hand the sheet a new object.
 */
import { useContext, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useTabZone } from '@/components/trip/use-tab-zone';
import { sheetHeights, type SheetHeights } from '@/components/ui/sheet-geometry';
import { peekRowHeight } from '@/features/home/home-layout';
import { useAppearance } from '@/hooks/use-appearance';

export interface HomeLayout {
  width: number;
  height: number;
  topInset: number;
  /** The tab pill's height and its bottom offset (88 dp on a 390 by 844 phone); 0 with no bar. */
  tabZone: number;
  detents: SheetHeights;
  /** Where the header zone ends, in dp from the top of the window; `null` before it is laid out. */
  headerBottom: number | null;
  setHeaderBottom: (bottom: number) => void;
}

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

export function useHomeLayout(): HomeLayout {
  const { width, height } = useWindowDimensions();
  const { fontScale } = useAppearance();
  // The provider is expo-router's; outside one (a component test) there is no inset.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const tabZone = useTabZone();
  const [headerBottom, setHeaderBottom] = useState<number | null>(null);

  const detents = useMemo(
    () =>
      sheetHeights(
        {
          windowHeight: height,
          topInset: insets.top,
          bottomInset: insets.bottom,
          tabZone,
          // Part of the geometry's shape; the three heights do not read it.
          headerBottom: insets.top,
        },
        peekRowHeight(fontScale),
      ),
    [height, insets.top, insets.bottom, tabZone, fontScale],
  );

  return {
    width,
    height,
    topInset: insets.top,
    tabZone,
    detents,
    headerBottom,
    setHeaderBottom,
  };
}
