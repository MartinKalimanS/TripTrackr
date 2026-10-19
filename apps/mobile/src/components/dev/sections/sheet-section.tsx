/**
 * The Home sheet at its three detents (feature 005, T524; contract C5-22), each in a bounded
 * frame standing in for the screen: the sheet is `position: absolute` over whatever is
 * behind it (here the sky of the globe), so a frame gives it a bottom edge. The detents come
 * from `sheetHeights` for the frame's height, so the arithmetic is the real one. Every sheet
 * is live: drag its handle, tap it to cycle, or step it with the accessibility actions.
 *
 * The Android back gesture is left to the route (`handleBack={false}`), or three sheets
 * would each take it.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { ListGroup, ListRow } from '@/components/ui/list-group';
import { Scrim } from '@/components/ui/scrim';
import { Sheet, type SheetDetent } from '@/components/ui/sheet';
import { sheetHeights } from '@/components/ui/sheet-geometry';
import { Text } from '@/components/ui/text';

import { Frame, Section } from '../gallery-parts';

const FRAME_HEIGHT = 380;
/** The live row of the peek: a 56 dp greeting line stands in for it. */
const LIVE_ROW = 56;
const HEIGHTS = sheetHeights(
  {
    windowHeight: FRAME_HEIGHT,
    topInset: 0,
    bottomInset: 0,
    tabZone: 0,
    headerBottom: 0,
  },
  LIVE_ROW,
);

const DETENTS: readonly SheetDetent[] = ['peek', 'half', 'full'];

function Body() {
  return (
    <View className="gap-3 px-4">
      <Text variant="headline">Where you have been</Text>
      <ListGroup testID="gallery-sheet-rows">
        <ListRow title="Portugal" description="3 trips · first in 2026" />
        <ListRow title="Japan" description="1 trip · 2025" />
        <ListRow title="Iceland" description="Planned · January" />
      </ListGroup>
    </View>
  );
}

function SheetFrame({ initial }: { initial: SheetDetent }) {
  const [detent, setDetent] = useState<SheetDetent>(initial);
  return (
    <View className="gap-2">
      <Text variant="eyebrow" tone="muted">
        {`${initial} · ${HEIGHTS[initial]} dp`}
      </Text>
      <Frame height={FRAME_HEIGHT} testID={`gallery-sheet-frame-${initial}`}>
        <Scrim kind="sky" />
        <Sheet
          detents={HEIGHTS}
          detent={detent}
          onDetentChange={setDetent}
          handleLabel={`Gallery sheet, ${initial}`}
          handleBack={false}
          renderBody={() => <Body />}
        />
      </Frame>
    </View>
  );
}

export function SheetSection() {
  return (
    <Section
      id="sheet"
      title="Sheet"
      note="Peek, half and full in a bounded frame. Drag the handle: it settles on a detent.">
      {DETENTS.map((detent) => (
        <SheetFrame key={detent} initial={detent} />
      ))}
    </Section>
  );
}
