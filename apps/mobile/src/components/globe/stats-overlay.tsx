/**
 * The statistics overlay — T097, FR-050, Acceptance Scenario 3.5.
 *
 * Countries visited and distance travelled, computed on the device (research
 * D-30) and shown in the device's locale and measurement system. The panel
 * floats over map content, so feature 002 contract C12 decides its treatment:
 * flat — no shadow falls onto the map (FR-024) — and opaque with a compliant
 * border, so it reads over light and dark imagery alike (FR-025). `Surface`'s
 * `interactive` flag is its documented switch for that border.
 *
 * Announced as one summary in words: "12,346 km" is read letter by letter by
 * some screen readers, "kilometres" never is.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Surface } from '@/components/ui/surface';
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
    <Surface
      testID="globe-stats"
      treatment="flat"
      interactive
      radius="lg"
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${count} ${countries} visited, ${distance.spoken} travelled`}
      style={styles.panel}>
      <Stat testID="globe-stat-countries" value={count} label={countries} />
      <Stat testID="globe-stat-distance" value={distance.text} label="travelled" />
    </Surface>
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
      <ThemedText testID={testID} style={styles.value}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textMuted">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  stat: {
    gap: Spacing.half,
  },
  value: {
    fontWeight: 700,
    fontVariant: ['tabular-nums'],
  },
});
