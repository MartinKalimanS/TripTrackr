/**
 * "Where to?" in New trip (feature 005, F6; UI-SPEC 9.1; `core/form.png`; spec 015 T1509, FR-012):
 * the cream 56 dp field with a search glyph and "Add a city or country". It is a real control:
 * the trip is saved and opened on the editor of its first stop, which is where a place is
 * chosen. Its hint says so, since a field that saves is not what a traveller expects.
 *
 *   <PicturedDestination onAction={saveAndAddStop} />
 *
 * The pictured "Cover" and "Dates" are not drawn: the app keeps no chosen cover (it comes from
 * the trip's photos) and no trip dates (they come from its stops), and spec 015 retires Q-11.
 * The id is `trip-destination-add`.
 */
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { cornerOf } from '@/theme';

type LabelProps = { label: string; hint?: string };

export function PicturedLabel({ label, hint }: LabelProps) {
  return (
    <View className="flex-row items-baseline justify-between gap-2">
      <Text variant="label" strong>
        {label}
      </Text>
      {hint ? (
        <Text variant="label" tone="muted" className="shrink">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const ROW =
  'flex-row items-center gap-3 border border-border bg-surface-secondary px-4 py-3';

export function PicturedDestination({ onAction }: { onAction: () => void }) {
  return (
    <View testID="trip-destination" className="gap-2">
      <PicturedLabel label="Where to?" hint="Cities or countries" />
      <Tappable
        testID="trip-destination-add"
        accessibilityLabel="Add a city or country"
        accessibilityHint="Saves the trip, then adds its first stop"
        onPress={onAction}
        className={ROW}
        style={[cornerOf('md'), { minHeight: 56 }]}>
        <Icon name="search" size={20} tone="muted" />
        <Text variant="body" tone="muted" className="flex-1">
          Add a city or country
        </Text>
      </Tappable>
    </View>
  );
}
