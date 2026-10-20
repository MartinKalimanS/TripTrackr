/**
 * One city of a trip, as its offline map is doing — tasks.md T105, 004 T444 (FR-044;
 * 004 FR-005, FR-015, FR-024, FR-025, FR-029, FR-030, FR-037).
 *
 * A raised card with the city (headline), its country (muted caption), what its saved
 * map is doing, and the actions that state allows. The state is a chip — an icon and the
 * words, tinted by how it reads (`ToneChip`), never colour alone (FR-025):
 *
 *   not saved    muted     "Not saved on this device"
 *   downloading  default   "Downloading… 42%"
 *   ready        success   "Ready offline · 12.4 MB"
 *   failed       danger    the failure in words, an alert with its own icon (`InlineError`):
 *                          a full sentence is too long for a chip
 *
 * The chip and the alert are the same element the status text was (`offline-status-<id>`):
 * its words, its spoken form ("megabytes", not "MB") and, for a failure, its `alert` role
 * are unchanged (FR-030).
 *
 * The actions are compact `Button`s in a row that wraps at large text. No state has a
 * primary: the screen lists a card per city, and one primary per screen state (FR-005)
 * leaves Download and Try again `secondary` and Stop and Remove `destructive` (soft red,
 * with the words and a glyph, never colour alone). Each keeps the id, accessible name and
 * visible word it had: Download, Try again, Stop, Remove.
 *
 * The card knows nothing of Mapbox: the screen hands it the state and the three callbacks
 * (`useOfflinePacks`, features/trips/use-offline-pack.ts).
 *
 * Visibility posture: device-only, as the screen's (app/trip/[id]/offline-maps.tsx).
 */
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { IconName } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import { Text } from '@/components/ui/text';
import { ToneChip, type ToneChipTone } from '@/components/ui/tone-chip';
import {
  packStatusText,
  type OfflineCity,
  type OfflinePackState,
} from '@/features/trips/offline-packs';

export type CityPackCardProps = {
  city: OfflineCity;
  state: OfflinePackState;
  onDownload: () => void;
  onStop: () => void;
  onRemove: () => void;
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

/**
 * What a traveller can do with a city's map in its current state: download it (or try
 * again), stop a download, or remove what is saved.
 */
function PackActions({ city, state, onDownload, onStop, onRemove }: CityPackCardProps) {
  const { cityId, cityName } = city;
  const failed = state.kind === 'error';
  const canRemove = state.kind === 'ready' || (state.kind === 'error' && state.partial);
  return (
    <View testID={`offline-actions-${cityId}`} className="flex-row flex-wrap gap-2">
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
  );
}

export function CityPackCard(props: CityPackCardProps) {
  const { city, state } = props;
  return (
    <Card testID={`offline-city-${city.cityId}`}>
      <View className="gap-3">
        <View className="items-start gap-1">
          <Text type="headline">{city.cityName}</Text>
          {city.countryName ? (
            <Text type="caption" tone="muted">
              {city.countryName}
            </Text>
          ) : null}
          <PackStatus cityId={city.cityId} state={state} />
        </View>
        <PackActions {...props} />
      </View>
    </Card>
  );
}
