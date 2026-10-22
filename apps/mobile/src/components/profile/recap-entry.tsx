/**
 * `RecapEntry` - the pictured "Your 2026 in 7 slides / See it and share it" row (feature 005,
 * F13, T557; FR-080 as amended by Q-11; UI-SPEC section 10; the pictures `profile.png`,
 * `profile-dark.png`; prototype `styles.css` `.recap`).
 *
 * The recap and the share poster are not built (sharing waits on the offline-sync gate), so the
 * row is drawn as pictured and is a coming-soon control: one `Tappable`, role button, hinted "Not
 * available yet", whose only effect is the one toast. It opens nothing, writes nothing and shows
 * no figure about the traveller: the year is the year in view (this year for All time), and
 * nothing is computed for the "slides". 72 dp at least, `accentTint`, radius 24, padding 12, a
 * 48 dp coral-to-amber tile with a sparkle, the `callout` title, a `label` muted subtitle and a
 * chevron that mirrors in a right-to-left layout.
 */
import { View } from 'react-native';

import { COMING_SOON_HINT, useComingSoon } from '@/components/ui/coming-soon-button';
import { Icon } from '@/components/ui/icon';
import { Scrim } from '@/components/ui/scrim';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { RECAP_SUBTITLE, recapTitle } from '@/features/passport/passport-copy';
import { Radii, Space } from '@/theme';

export interface RecapEntryProps {
  /** `all` or a year. */
  period: string;
  /** The calendar year today, for All time. */
  thisYear: number;
}

export function RecapEntry({ period, thisYear }: RecapEntryProps) {
  const soon = useComingSoon('Your year');
  const title = recapTitle(period, thisYear);
  return (
    <Tappable
      testID="coming-soon-recap"
      accessibilityLabel={`${title}, ${RECAP_SUBTITLE}`}
      accessibilityHint={COMING_SOON_HINT}
      onPress={soon}
      className="bg-accent-tint"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Space[3],
        minHeight: 72,
        padding: Space[3],
        borderRadius: Radii.xl,
        borderCurve: 'continuous',
      }}>
      <View
        testID="recap-tile"
        style={{
          width: 48,
          height: 48,
          borderRadius: Radii.lg,
          borderCurve: 'continuous',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Scrim kind="recap" />
        <Icon name="sparkle" size={24} tone="accentInk" />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="callout">{title}</Text>
        <Text variant="label" tone="muted">
          {RECAP_SUBTITLE}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} tone="muted" />
    </Tappable>
  );
}
