/**
 * `AreasStrip` - the five areas of a trip (tasks.md T544; contract C5-20; spec FR-039, FR-070,
 * FR-075; screens.md "Trip"): four count tiles (Photos, Notes, Expenses, Documents), the one
 * line that says Expenses and Documents are only visible to the traveller, and the Offline
 * maps row beneath. It replaces the sideways row of chips of feature 003 (FR-018).
 *
 *   <AreasStrip counts={counts} spending={{ total, currency }} warnPhotos={failed > 0}
 *               onOpen={(segment) => router.push(`/trip/${id}/${segment}`)} />
 *
 * Ids and names are the 004 row's: the strip is `trip-links`, each control `trip-open-<segment>`
 * (`photos`, `notes`, `expenses`, `documents`, `offline-maps`) and keeps the accessible name it
 * had ("Photos for this trip", "Spending for this trip", "Travel documents for this trip", ...)
 * with the figure said as its VALUE after the name (`AreaPill`'s `accessibilityLabel`), so what a
 * screen reader announces for the control does not change (FR-075).
 *
 * - The tiles are four columns, and two from a font scale of 1.15 (`areaColumns`): each tile is
 *   a percentage-wide cell with 4 dp of padding on every side inside a -4 dp margin, which makes
 *   the 8 dp gutter without arithmetic on the screen's width. A tile grows with its text.
 * - Expenses shows the exact total in the home currency in the device's format (`formatMoney`
 *   hands the decimal string to `Intl`, so no amount becomes a float on its way to the screen).
 * - The lock is on Expenses and Documents only, and the one line says why, in words, in the aqua
 *   ink (aqua means "only you"); the line is not colour alone, it has a lock and the words.
 * - `warnPhotos` rings the Photos tile and adds "needs attention" to its value: the upload that
 *   failed (FR-043).
 *
 * It reads what it is given and queries nothing (Constitution I and II).
 */
import { View, useWindowDimensions } from 'react-native';

import { AreaPill } from '@/components/ui/area-pill';
import { Icon, type IconName } from '@/components/ui/icon';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import { areaColumns } from '@/components/ui/reflow';
import { Text } from '@/components/ui/text';
import { formatMoney } from '@/lib/locale';

export type AreaSegment = 'photos' | 'notes' | 'expenses' | 'documents' | 'offline-maps';

export interface AreasStripProps {
  counts: { photos: number; notes: number; documents: number };
  /** Exact decimal string and the home currency: the Expenses tile's figure. */
  spending: { total: string; currency: string };
  /** An upload on this trip failed: ring the Photos tile. */
  warnPhotos?: boolean;
  onOpen: (segment: AreaSegment) => void;
}

interface Tile {
  segment: Exclude<AreaSegment, 'offline-maps'>;
  label: string;
  icon: IconName;
  private: boolean;
}

/** The names of the controls: the 004 row's, word for word (a table, so the id guard reads them). */
const NAMES = {
  photos: 'Photos for this trip',
  notes: 'Notes for this trip',
  expenses: 'Spending for this trip',
  documents: 'Travel documents for this trip',
} as const;

/** In the order of the screen. */
const TILES: readonly Tile[] = [
  { segment: 'photos', label: 'Photos', icon: 'images', private: false },
  { segment: 'notes', label: 'Notes', icon: 'note', private: false },
  { segment: 'expenses', label: 'Expenses', icon: 'wallet', private: true },
  { segment: 'documents', label: 'Documents', icon: 'file-text', private: true },
];

const PRIVACY_LINE = 'Expenses and documents are only visible to you.';
const LOCK: IconName = 'lock';
const MAP: IconName = 'map';

/** The figure a tile shows: a count, or the exact total of the Expenses tile. */
function figureOf(
  segment: Tile['segment'],
  { counts, spending }: Pick<AreasStripProps, 'counts' | 'spending'>,
): string {
  if (segment === 'expenses') return formatMoney(spending.total, spending.currency);
  return String(counts[segment]);
}

function PrivacyLine() {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name={LOCK} size={16} tone="aquaInk" />
      <Text variant="caption" tone="aqua" testID="trip-privacy-line" className="shrink">
        {PRIVACY_LINE}
      </Text>
    </View>
  );
}

export function AreasStrip({ counts, spending, warnPhotos, onOpen }: AreasStripProps) {
  const { fontScale } = useWindowDimensions();
  const cell = areaColumns(fontScale) === 4 ? '25%' : '50%';
  return (
    <View testID="trip-links" className="gap-3">
      <View className="-m-1 flex-row flex-wrap">
        {TILES.map((tile) => (
          <View
            key={tile.segment}
            testID={`trip-tile-${tile.segment}`}
            style={{ width: cell, padding: 4 }}>
            <AreaPill
              icon={tile.icon}
              label={tile.label}
              count={figureOf(tile.segment, { counts, spending })}
              private={tile.private}
              warn={tile.segment === 'photos' && warnPhotos}
              accessibilityLabel={NAMES[tile.segment]}
              testID={`trip-open-${tile.segment}`}
              onPress={() => onOpen(tile.segment)}
            />
          </View>
        ))}
      </View>
      <PrivacyLine />
      <ListGroup>
        <ListRow
          testID="trip-open-offline-maps"
          title="Offline maps"
          accessibilityLabel="Offline maps for this trip"
          leading={<Icon name={MAP} size={24} tone="muted" />}
          onPress={() => onOpen('offline-maps')}
        />
      </ListGroup>
    </View>
  );
}
