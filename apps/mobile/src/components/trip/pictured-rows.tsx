/**
 * The pictured rows of New trip that have no capability behind them (feature 005, F6;
 * owner decision Q-11; UI-SPEC 9.1 and 10; `core/form.png`): "Where to?", "Cover" and
 * "Dates". The picture draws them, the app cannot store a destination list, a chosen cover
 * or trip dates (dates come from the stops), so each is a COMING-SOON control: a real
 * button named from the picture, hinted "Not available yet", whose only effect is ONE toast
 * (`useComingSoon`). Nothing here is written, sent or remembered, and no figure, photograph
 * or choice of the picture is invented: the destination row is the empty search field, the
 * cover is the dashed "Photos" tile alone, the dates row says "Add dates".
 *
 *   <PicturedField name="trip-destination" thing="Adding places" label="Where to?"
 *     hint="Cities or countries" icon="search" text="Add a city or country" />
 *   <PicturedCover />
 *   <PicturedDates />
 *
 * Ids are `coming-soon-<name>`. The look is the prototype's: the field is the cream 56 dp
 * input with its 3:1 boundary and a 12 dp radius; the dates row is the same in a capsule
 * with a chevron; the cover tile is a 76 dp rounded square with a dashed edge.
 */
import { View } from 'react-native';

import { COMING_SOON_HINT, useComingSoon } from '@/components/ui/coming-soon-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { cornerOf } from '@/theme';

/** The cover tile's side, the prototype's `.cv` (76 dp). */
export const COVER_TILE = 76;

type LabelProps = { label: string; hint?: string };

/** `.field > .lbl`: the label, and an optional hint at the right in the subtle ink. */
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

type RowProps = {
  /** The id suffix: `coming-soon-<name>`. */
  name: string;
  /** The subject of the toast: "<Thing> is coming soon". */
  thing: string;
  /** The accessible name. */
  accessibilityLabel: string;
  icon: IconName;
  text: string;
  /** `field` is the 12 dp input; `capsule` is the dates row. */
  shape?: 'field' | 'capsule';
  /** Shows a chevron at the end. */
  chevron?: boolean;
};

const ROW =
  'flex-row items-center gap-3 border border-border bg-surface-secondary px-4 py-3';

/** One cream row that answers with the coming-soon toast. */
function PicturedRow({
  name,
  thing,
  accessibilityLabel,
  icon,
  text,
  shape = 'field',
  chevron = false,
}: RowProps) {
  const onPress = useComingSoon(thing);
  return (
    <Tappable
      testID={`coming-soon-${name}`}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={COMING_SOON_HINT}
      onPress={onPress}
      className={ROW}
      style={[cornerOf(shape === 'capsule' ? 'full' : 'md'), { minHeight: 56 }]}>
      <Icon name={icon} size={20} tone="muted" />
      <Text variant="body" tone="muted" className="flex-1">
        {text}
      </Text>
      {chevron ? <Icon name="chevron-right" size={20} tone="muted" /> : null}
    </Tappable>
  );
}

/** "Where to?": the label, its hint and the empty search field. */
export function PicturedDestination() {
  return (
    <View testID="trip-destination" className="gap-2">
      <PicturedLabel label="Where to?" hint="Cities or countries" />
      <PicturedRow
        name="trip-destination"
        thing="Adding places"
        accessibilityLabel="Add a city or country"
        icon="search"
        text="Add a city or country"
      />
    </View>
  );
}

/** "Cover": the dashed "Photos" tile on its own (no suggested photographs are invented). */
export function PicturedCover() {
  const onPress = useComingSoon('Choosing a cover');
  return (
    <View testID="trip-cover" className="gap-2">
      <PicturedLabel label="Cover" />
      <View className="flex-row">
        <Tappable
          testID="coming-soon-trip-cover"
          accessibilityLabel="Photos"
          accessibilityHint={COMING_SOON_HINT}
          onPress={onPress}
          className="items-center gap-1 border-[1.5px] border-dashed border-border"
          style={[
            cornerOf('lg'),
            { width: COVER_TILE, minHeight: COVER_TILE, justifyContent: 'center' },
          ]}>
          <Icon name="image" size={24} tone="ink" />
          <Text variant="label" strong>
            Photos
          </Text>
        </Tappable>
      </View>
    </View>
  );
}

/** "Dates": a capsule row, "Add dates", that is the coming-soon control. */
export function PicturedDates() {
  return (
    <View testID="trip-dates" className="gap-2">
      <PicturedLabel label="Dates" />
      <PicturedRow
        name="trip-dates"
        thing="Trip dates"
        accessibilityLabel="Add dates"
        icon="calendar"
        text="Add dates"
        shape="capsule"
        chevron
      />
    </View>
  );
}
