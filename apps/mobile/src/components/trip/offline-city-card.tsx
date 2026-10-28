/**
 * One city of a trip, as its offline map is doing: the pictured row of the offline maps
 * screen (feature 005, F11; UI-SPEC 9.2; tasks.md T552; prototype `.mrow`, `.mthumb`,
 * `.mtx`, `.mact`; picture `more/offline-maps`). Before it: tasks.md T105, 004 T444 (FR-044;
 * 004 FR-005, FR-015, FR-024, FR-025, FR-029, FR-030, FR-037).
 *
 * A row, not a card: a 72 dp map tile (`OfflineMapTile`), the city (callout), its country
 * (muted label), what its saved map is doing and the actions that state allows. The state is
 * a chip: an icon and the words, tinted by how it reads (`ToneChip`), never colour alone
 * (FR-025):
 *
 *   not saved    muted     "Not saved on this device"
 *   downloading  default   "Downloading… 42%"
 *   ready        success   "Ready offline · 12.4 MB"
 *   failed       danger    the failure in words, an alert with its own icon (`InlineError`)
 *
 * The chip and the alert are the same element the status text was (`offline-status-<id>`):
 * its words, its spoken form ("megabytes", not "MB") and, for a failure, its `alert` role
 * are unchanged (FR-030).
 *
 * A map that still has something to do ("For this trip") shows, as pictured, the "Map >"
 * link (a coming-soon control: nothing opens it yet) and the outlined Download (or Try
 * again, Stop, Remove): each keeps the id, accessible name and word it had. A finished map
 * ("Downloaded") shows the trash icon at the end, which is the real Remove (confirmed by the
 * screen: `offline-remove-<id>`). Sizes are only what the saved map reports: a map not
 * saved yet shows no size, because the app cannot know it (no invented "240 MB").
 *
 * The row knows nothing of Mapbox: the screen hands it the state and the three callbacks
 * (`useOfflinePacks`, features/trips/use-offline-pack.ts).
 *
 * Visibility posture: device-only, as the screen's (app/trip/[id]/offline-maps.tsx).
 */
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { COMING_SOON_HINT, useComingSoon } from '@/components/ui/coming-soon-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { InlineError } from '@/components/ui/inline-error';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { ToneChip, type ToneChipTone } from '@/components/ui/tone-chip';
import {
  packStatusText,
  type OfflineCity,
  type OfflinePackState,
} from '@/features/trips/offline-packs';
import { Space } from '@/theme';

import { MAP_TILE_SIZE, OfflineMapTile } from './offline-map-tile';

export type CityPackCardProps = {
  city: OfflineCity;
  state: OfflinePackState;
  onDownload: () => void;
  onStop: () => void;
  onRemove: () => void;
  /** Draws the hairline above the row, from the text's edge (every row but the first). */
  separated?: boolean;
};

type ChipState = Exclude<OfflinePackState['kind'], 'error'>;

const STATUS_LOOK: Record<ChipState, { icon: IconName; tone: ToneChipTone }> = {
  none: { icon: 'cloud-off', tone: 'muted' },
  downloading: {
    icon: 'download',
    tone: 'default',
  },
  ready: { icon: 'check-circle', tone: 'success' },
};

const DOWNLOAD: IconName = 'download';
const RETRY: IconName = 'refresh';
const STOP: IconName = 'stop-circle';
const REMOVE: IconName = 'trash';

/** What a city's map is doing, in words and a glyph; a failure is an alert instead. */
function PackStatus({ cityId, state }: { cityId: number; state: OfflinePackState }) {
  if (state.kind === 'error') {
    return <InlineError testID={`offline-status-${cityId}`} message={state.message} />;
  }
  const { text, spoken } = packStatusText(state);
  const { icon, tone } = STATUS_LOOK[state.kind];
  return (
    <ToneChip
      testID={`offline-status-${cityId}`}
      label={text}
      accessibilityLabel={spoken}
      icon={icon}
      tone={tone}
    />
  );
}

/** The pictured "Map >" link. Nothing opens the map from here yet: one toast, nothing else. */
function MapLink({ city }: { city: OfflineCity }) {
  const comingSoon = useComingSoon('The map view');
  return (
    <Tappable
      testID={`coming-soon-offline-map-${city.cityId}`}
      accessibilityLabel={`${city.cityName} on the map`}
      accessibilityHint={COMING_SOON_HINT}
      onPress={comingSoon}
      className="flex-row items-center">
      <Text variant="label" strong>
        Map
      </Text>
      <Icon name="chevron-right" size={16} tone="default" />
    </Tappable>
  );
}

/**
 * What a traveller can do with a city's map that is not finished: download it (or try
 * again), stop a download, or remove what a failed one left.
 */
function PackActions({ city, state, onDownload, onStop, onRemove }: CityPackCardProps) {
  const { cityId, cityName } = city;
  const failed = state.kind === 'error';
  const canRemove = state.kind === 'error' && state.partial;
  return (
    <View
      className="flex-row flex-wrap items-center justify-between"
      style={{ columnGap: Space[2], rowGap: Space[1], marginTop: Space[2] }}>
      <MapLink city={city} />
      <View
        testID={`offline-actions-${cityId}`}
        className="flex-row flex-wrap justify-end"
        style={{ gap: Space[2] }}>
        {state.kind === 'none' || failed ? (
          <Button
            testID={`offline-download-${cityId}`}
            variant="secondary"
            size="sm"
            icon={failed ? RETRY : DOWNLOAD}
            accessibilityLabel={
              failed
                ? `Try downloading ${cityName} again`
                : `Download ${cityName} for offline use`
            }
            onPress={onDownload}>
            {failed ? 'Try again' : 'Download'}
          </Button>
        ) : null}
        {state.kind === 'downloading' ? (
          <Button
            testID={`offline-stop-${cityId}`}
            variant="destructive"
            size="sm"
            icon={STOP}
            accessibilityLabel={`Stop downloading ${cityName}`}
            onPress={onStop}>
            Stop
          </Button>
        ) : null}
        {canRemove ? (
          <Button
            testID={`offline-remove-${cityId}`}
            variant="destructive"
            size="sm"
            icon={REMOVE}
            accessibilityLabel={`Remove ${cityName}’s offline map`}
            onPress={onRemove}>
            Remove
          </Button>
        ) : null}
      </View>
    </View>
  );
}

export function CityPackCard(props: CityPackCardProps) {
  const { city, state, separated = false, onRemove } = props;
  const saved = state.kind === 'ready';
  return (
    <View
      testID={`offline-city-${city.cityId}`}
      className="flex-row items-center"
      style={{ columnGap: Space[4], paddingVertical: Space[3], minHeight: 88 }}>
      {separated ? (
        <View
          testID={`offline-city-${city.cityId}-divider`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute top-0 right-0 bg-separator"
          style={{ left: MAP_TILE_SIZE + Space[4], height: 1 }}
        />
      ) : null}
      <OfflineMapTile saved={saved} cityId={city.cityId} />
      <View className="min-w-0 flex-1 items-start" style={{ gap: Space[1] }}>
        <Text variant="callout" strong numberOfLines={2}>
          {city.cityName}
        </Text>
        {city.countryName ? (
          <Text variant="label" tone="muted" numberOfLines={1}>
            {city.countryName}
          </Text>
        ) : null}
        <View className="self-stretch items-start" style={{ marginTop: Space[1] }}>
          <PackStatus cityId={city.cityId} state={state} />
        </View>
        {saved ? null : (
          <View className="self-stretch">
            <PackActions {...props} />
          </View>
        )}
      </View>
      {saved ? (
        <IconButton
          testID={`offline-remove-${city.cityId}`}
          icon={REMOVE}
          variant="ghost"
          accessibilityLabel={`Remove ${city.cityName}’s offline map`}
          onPress={onRemove}
        />
      ) : null}
    </View>
  );
}
