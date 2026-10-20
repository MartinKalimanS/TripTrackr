/**
 * The statistics overlay — T097, FR-050, Acceptance Scenario 3.5; Atlas card by
 * feature 004 (T428; FR-018, FR-033, research D4-11).
 *
 * Countries visited and distance travelled, computed on the device (research
 * D-30) and shown in the device's locale and measurement system. The panel
 * floats over map content, so it is a `Card overMap`: the opaque `surface`
 * fill with a hairline `border`, no shadow and no translucency, which reads over
 * the lightest ice and the darkest night basemap alike. Nothing is tinted or
 * laid across the globe itself.
 *
 * The two figures are the display face with tabular numerals (`numeric` text in
 * the `title` size), so a count and a distance do not jitter as they change;
 * their labels are muted captions.
 *
 * Announced as one summary in words: "12,346 km" is read letter by letter by
 * some screen readers, "kilometres" never is. The announcement sits on an outer
 * view because a plain `Card` announces nothing of its own; the card inside only
 * paints, so there is one focus stop and its name and role are the ones the
 * screen has always had.
 */
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import type { TravelSummary } from '@/features/globe/travel-stats';
import { deviceLocale, formatDistance } from '@/lib/locale';

export type StatsOverlayProps = {
  summary: TravelSummary;
};

export function StatsOverlay({ summary }: StatsOverlayProps) {
  const locale = deviceLocale();
  const distance = formatDistance(summary.distanceKm, locale);
  const count = new Intl.NumberFormat(locale.languageTag).format(
    summary.countriesVisited,
  );
  const countries = summary.countriesVisited === 1 ? 'country' : 'countries';

  return (
    <View
      testID="globe-stats"
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${count} ${countries} visited, ${distance.spoken} travelled`}
      style={styles.outer}>
      <Card overMap testID="globe-stats-card" style={styles.card}>
        <Stat testID="globe-stat-countries" value={count} label={countries} />
        <Stat testID="globe-stat-distance" value={distance.text} label="travelled" />
      </Card>
    </View>
  );
}

function Stat({
  testID,
  value,
  label,
}: {
  testID: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <Text type="numeric" context="title" testID={testID}>
        {value}
      </Text>
      <Text type="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Hugs its content, but never wider than the screen it floats over.
  outer: {
    maxWidth: '100%',
  },
  // The kit's card pads 16 dp all round; the chip keeps the compact inset it has
  // always had. A style, not a class, so no stylesheet order can change it.
  card: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.four,
    rowGap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  stat: {
    gap: Spacing.half,
  },
});
