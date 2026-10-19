/**
 * `NowChip` - the "Now" beside the stop the traveller is at (tasks.md T545; contract C5-20;
 * spec FR-041, FR-070): the cream capsule of an active status (`STATUS_LOOKS.active`, the pair the
 * contrast gate measures) with the coral live dot, in words and a mark, never colour alone.
 *
 * ONE announced element named "Now" (the stop's own name says it too), id `stop-now-<id>`. It
 * is a label, not a control. The dot is the 8 dp coral dot with a 3 dp halo of the status chip.
 */
import { View } from 'react-native';

import { STATUS_LOOKS } from '@/components/ui/chip-look';
import { SoftLabel } from '@/components/ui/soft-label';
import { useColors } from '@/components/ui/theme-tokens';
import { cornerOf } from '@/theme';

const DOT = 8;
const HALO = 3;
const COLOR_KEYS = ['accentLine', 'accentTint'] as const;

function Dot({ stopId }: { stopId: string }) {
  const colors = useColors(COLOR_KEYS);
  return (
    <View
      testID={`stop-now-${stopId}-dot`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: DOT + 2 * HALO,
        height: DOT + 2 * HALO,
        ...cornerOf('full'),
        backgroundColor: colors.accentLine,
        borderWidth: HALO,
        borderColor: colors.accentTint,
      }}
    />
  );
}

export function NowChip({ stopId }: { stopId: string }) {
  return (
    <SoftLabel
      look={STATUS_LOOKS.active}
      label="Now"
      accessibilityLabel="Now"
      testID={`stop-now-${stopId}`}
      leading={<Dot stopId={stopId} />}
    />
  );
}
