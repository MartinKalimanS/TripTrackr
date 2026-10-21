/**
 * `PhotoStatusPill` - the status chip of a card laid over a PHOTOGRAPH (feature 005, F4;
 * prototype `.pill.on-photo` and `.live-dot`; picture `core/trips`): "Active · Day 3 of 8" on a
 * white capsule with navy ink and a small shadow, whatever the theme, because what is under it is
 * a photograph and not the ground of the screen. The live dot is the LIGHT theme's coral line
 * (`#E04A33` in Sunrise, 3:1 on white) with a 22% halo; the dark theme's lighter coral would be
 * 2.4:1 on the white capsule.
 *
 * It says what `StatusChip` says, with the same id (`status-pill-<status>`), the same words and
 * the same accessible name ("Status: Active, day 3 of 8"); only the paint differs. A hero is the
 * active trip's, so the other two statuses draw their glyph (a calendar, a check) in the navy.
 */
import { View } from 'react-native';

import { useAppearance } from '@/hooks/use-appearance';
import { STATUS_PRESENTATION, type TripStatus } from '@/features/trips/trip-status';
import { Palettes, Radii, Space, withAlpha } from '@/theme';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export interface PhotoStatusPillProps {
  status: TripStatus;
  /** "Day 3 of 8", for an active trip. */
  dayOf?: { day: number; of: number };
}

/** The 8 dp dot and its 3 dp halo: the prototype's `.live-dot`. */
const DOT = 8;
const HALO = 3;
const HALO_ALPHA = 0.22;
/** `.pill.on-photo`: `box-shadow: 0 1px 2px rgba(0,0,0,.18)`. */
const SHADOW_ALPHA = 0.18;

/** A literal per status, so the id extractor reads each one. */
const IDS = {
  planning: 'status-pill-planning',
  active: 'status-pill-active',
  past: 'status-pill-past',
} as const satisfies Record<TripStatus, string>;

const GLYPH: Record<Exclude<TripStatus, 'active'>, IconName> = {
  planning: 'calendar',
  past: 'check-circle',
};

function LiveDot({ line }: { line: string }) {
  return (
    <View
      testID="status-pill-active-dot"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: DOT + 2 * HALO,
        height: DOT + 2 * HALO,
        borderRadius: Radii.full,
        backgroundColor: line,
        borderWidth: HALO,
        borderColor: withAlpha(line, HALO_ALPHA),
      }}
    />
  );
}

export function PhotoStatusPill({ status, dayOf }: PhotoStatusPillProps) {
  const { prefersMoreContrast } = useAppearance();
  const { label } = STATUS_PRESENTATION[status];
  const day = status === 'active' ? dayOf : undefined;
  const words = day ? `${label} · Day ${day.day} of ${day.of}` : label;
  const spoken = day ? `${label}, day ${day.day} of ${day.of}` : label;
  const light = Palettes[prefersMoreContrast ? 'light-contrast' : 'light'];

  return (
    <View
      testID={IDS[status]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Status: ${spoken}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingVertical: Space[1],
        paddingLeft: Space[2],
        paddingRight: 10,
        borderRadius: Radii.full,
        backgroundColor: light.onPhoto,
        boxShadow: [
          {
            offsetX: 0,
            offsetY: 1,
            blurRadius: 2,
            color: withAlpha(light.ink, SHADOW_ALPHA),
          },
        ],
      }}>
      {status === 'active' ? (
        <LiveDot line={light.accentLine} />
      ) : (
        <Icon name={GLYPH[status]} size={16} tone="onAccent" />
      )}
      <Text variant="caption" capped tone="onAccent" className="shrink">
        {words}
      </Text>
    </View>
  );
}
