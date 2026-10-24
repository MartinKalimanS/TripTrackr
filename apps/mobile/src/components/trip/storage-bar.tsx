/**
 * `StorageBar` - the cream storage card of the offline maps screen (feature 005, F11;
 * UI-SPEC 9.2; tasks.md T552; prototype `.stor`, `.sthead`, `.stbar`, `.legend`; picture
 * `more/offline-maps`): "412 MB used by maps", the free space at the right, a 12 dp
 * segmented bar and its legend.
 *
 *   <StorageBar figures={storageFigures(states, freeDiskBytes())} caption={storageCaption(states)} />
 *
 * It draws only what the app can measure (`storageFigures`): the maps this trip's cities
 * take, from the sizes the cards show, and the room the device reports. With no free reading
 * there is no free figure, no bar and no legend (nothing is faked); with no finished map the
 * head is the caption's sentence ("None of this trip's cities are saved ... yet"). The
 * pictured "Photos waiting" segment is not drawn: the store has no byte sizes for pending
 * photographs. The whole card is one element for a screen reader (`offline-storage`), read
 * as the caption's spoken sentence and the free space; the bar and the legend repeat it and
 * are hidden from assistive technology.
 *
 * Visibility posture: device-only figures (public tile sizes, free disk space).
 */
import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import type { FormattedText } from '@/features/trips/offline-packs';
import type { StorageFigures } from '@/features/trips/offline-storage';
import { Radii, Space } from '@/theme';

export type StorageBarProps = {
  figures: StorageFigures;
  /** The sentence about this trip's maps (`storageCaption`), spoken and written. */
  caption: FormattedText;
};

export const STORAGE_BAR_HEIGHT = 12;
const SWATCH = 12;
const COLOR_KEYS = ['ink', 'sand', 'subtle'] as const;

/** What a screen reader says for the whole card. */
export function storageLabel({ figures, caption }: StorageBarProps): string {
  return figures.free ? `${caption.spoken} ${figures.free.spoken} free.` : caption.spoken;
}

function Head({ figures, caption }: StorageBarProps) {
  return (
    <View
      className="flex-row flex-wrap items-baseline justify-between"
      style={{ columnGap: Space[3], rowGap: Space[1] }}>
      {figures.saved ? (
        <View
          className="shrink flex-row flex-wrap items-baseline"
          style={{ gap: Space[1] }}>
          <Text variant="headline" accessibilityRole="text" testID="offline-storage-used">
            {figures.maps.text}
          </Text>
          <Text variant="body" tone="muted">
            used by this trip’s maps
          </Text>
        </View>
      ) : (
        <Text
          variant="body"
          tone="muted"
          className="shrink"
          testID="offline-storage-used">
          {caption.text}
        </Text>
      )}
      {figures.free ? (
        <Text variant="label" tone="muted" testID="offline-storage-free">
          {`${figures.free.text} free`}
        </Text>
      ) : null}
    </View>
  );
}

function Legend({ colors }: { colors: Record<(typeof COLOR_KEYS)[number], string> }) {
  const swatch = { width: SWATCH, height: SWATCH, borderRadius: 4 } as const;
  return (
    <View
      testID="offline-storage-legend"
      className="flex-row flex-wrap items-center"
      style={{ columnGap: Space[4], rowGap: Space[1], marginTop: Space[3] }}>
      <View className="flex-row items-center" style={{ gap: Space[2], minHeight: 24 }}>
        <View style={[swatch, { backgroundColor: colors.ink }]} />
        <Text variant="body" tone="muted">
          Maps
        </Text>
      </View>
      <View className="flex-row items-center" style={{ gap: Space[2], minHeight: 24 }}>
        <View
          style={[
            swatch,
            { backgroundColor: colors.sand, borderWidth: 1, borderColor: colors.subtle },
          ]}
        />
        <Text variant="body" tone="muted">
          Free
        </Text>
      </View>
    </View>
  );
}

export function StorageBar(props: StorageBarProps) {
  const { figures } = props;
  const colors = useColors(COLOR_KEYS);
  const bar = figures.bar;

  return (
    <Card
      variant="tile"
      radius="xl"
      testID="offline-storage"
      accessibilityRole="summary"
      accessibilityLabel={storageLabel(props)}>
      <Head {...props} />
      {bar ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="offline-storage-bar"
          style={{
            height: STORAGE_BAR_HEIGHT,
            marginTop: Space[3],
            borderRadius: Radii.full,
            overflow: 'hidden',
            backgroundColor: colors.sand,
            flexDirection: 'row',
            gap: 2,
          }}>
          {bar.maps > 0 ? (
            <View
              testID="offline-storage-maps"
              style={{ width: `${bar.maps * 100}%`, backgroundColor: colors.ink }}
            />
          ) : null}
        </View>
      ) : null}
      {bar ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Legend colors={colors} />
        </View>
      ) : null}
    </Card>
  );
}
