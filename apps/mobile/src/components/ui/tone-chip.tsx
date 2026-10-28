/**
 * `ToneChip` - a small state label of Atlas: an icon and a few words in a capsule, tinted
 * by how the state reads (feature 004, tasks.md T444; contract C4-8; FR-023, FR-025,
 * FR-029, FR-030; review rules 3, 5 and 7). `StatusChip` is the same capsule for a trip's
 * status and `SyncBadge` for a record's synchronisation; this one is for any other state
 * a screen has to name (a city's offline map: saved, downloading, not saved).
 *
 *   <ToneChip label="Ready offline · 12.4 MB" icon={READY} tone="success"
 *             accessibilityLabel="Ready offline, 12.4 megabytes" testID="offline-status-7" />
 *
 * - The state is never colour alone (FR-025): the icon and the words say it, the tone
 *   only helps a glance. `muted` and `default` are outlined in the `border` token (3:1 on
 *   the surface, FR-024) with no fill; `success` and `danger` are the ink on its 15% soft
 *   fill, exactly the pairs the contrast gate measures on canvas, surface and overlay
 *   (C4-3), never the kit's 20% hover (rule 5) and never on a field or tertiary fill
 *   (rule 7). Every tone carries a one-pixel border, transparent on the soft ones, so a
 *   state that changes tone moves no pixel.
 * - It is a label, not a control: no press handler, no focus, no state, so no touch
 *   target. It is ONE announced element (`accessible`, role `text`) named by
 *   `accessibilityLabel`, which defaults to the visible words and is given when the words
 *   read badly aloud ("MB"); the icon is decorative and carries `<testID>-icon`.
 * - It hugs its content (`self-start`) and grows with the text size: the words wrap
 *   (`shrink`), are never capped and the capsule has no fixed height (FR-029).
 *
 * Colours are semantic classes and `Icon` tones, never a literal.
 */
import { View } from 'react-native';

import { Icon, type IconName, type IconTone } from './icon';
import { Text } from './text';

export type ToneChipTone = 'muted' | 'default' | 'success' | 'danger';

export interface ToneChipProps {
  /** The words on the chip. */
  label: string;
  /** What a screen reader says; defaults to `label`. */
  accessibilityLabel?: string;
  /** Drawn before the words, on both platforms. */
  icon: IconName;
  /** Default `muted`. */
  tone?: ToneChipTone;
  testID?: string;
}

interface Look {
  /** Literal classes, so Tailwind finds them: the ink, then the edge and the fill. */
  ink: string;
  box: string;
  icon: IconTone;
}

const LOOK: Record<ToneChipTone, Look> = {
  muted: { ink: 'text-muted', box: 'border-border', icon: 'muted' },
  default: { ink: 'text-foreground', box: 'border-border', icon: 'default' },
  success: {
    ink: 'text-success',
    box: 'border-transparent bg-success/15',
    icon: 'success',
  },
  danger: {
    ink: 'text-danger',
    box: 'border-transparent bg-danger/15',
    icon: 'danger',
  },
};

const CAPSULE = 'flex-row items-center self-start gap-1 rounded-full border px-2 py-0.5';

export function ToneChip({
  label,
  accessibilityLabel,
  icon,
  tone = 'muted',
  testID,
}: ToneChipProps) {
  const look = LOOK[tone];
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      className={`${CAPSULE} ${look.box}`}>
      <Icon
        name={icon}
        size={16}
        tone={look.icon}
        testID={testID ? `${testID}-icon` : undefined}
      />
      <Text variant="caption" className={`shrink ${look.ink}`}>
        {label}
      </Text>
    </View>
  );
}
