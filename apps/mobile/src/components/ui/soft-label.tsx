/**
 * `SoftLabel` - the tinted capsule behind `StatusChip`, `SyncBadge` and `PrivacyChip`
 * (feature 005, T520; contract C5-16). Internal to the adapter layer: screens use the three
 * adapters, which each hand it their `SoftLook` (`chip-look.ts`).
 *
 *   <SoftLabel look={PRIVACY_LOOK} label="Only you" accessibilityLabel="Only you can see this"
 *              leading={<Icon name="lock" size={16} tone="aquaInk" />} />
 *
 * - It is a LABEL, not a control: no press handler, no focus, no state, so no touch target.
 *   It is ONE announced element (`accessible`, role `text`) named by `accessibilityLabel`,
 *   which a caller gives where the visible words read badly aloud; the `leading` mark is the
 *   caller's decorative `Icon` (or a dot), so a caller keeps the id it has always put on it.
 * - The state is never colour alone (FR-025): the mark and the words say it, the tint only
 *   helps a glance; a dashed edge is a shape.
 * - It hugs its content (`alignSelf: 'flex-start'`) and grows with the text size: the words
 *   wrap (`shrink`), are capped at 1.3 like every pill (FR-074), and the capsule has a minimum
 *   padding, never a fixed height (FR-029).
 * - Colours are palette keys asked of the kit in one call (`useColors`); the ink is also the
 *   `Text` tone, so the words and the mark come from one key.
 */
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { Radii, Space } from '@/theme';

import type { SoftInk, SoftLook } from './chip-look';
import { Text, type TextTone } from './text';
import { useColors } from './theme-tokens';

/** The `Text` tone of each ink. */
const TEXT_TONE: Record<SoftInk, TextTone> = {
  ink: 'default',
  muted: 'muted',
  amberInk: 'amber',
  aquaInk: 'aqua',
  danger: 'danger',
};

/** Every key a soft label can paint with, asked of the kit in one call. */
const COLOR_KEYS = [
  'amberTint',
  'surfaceSecondary',
  'dangerTint',
  'aquaTint',
  'hairline',
  'amberLine',
  'danger',
] as const;

/** The prototype's `.pill`: `padding: 4px 10px 4px 8px; gap: 6px`. */
const PILL = {
  gap: 6,
  paddingVertical: Space[1],
  paddingLeft: Space[2],
  paddingRight: 10,
} as const;

export interface SoftLabelProps {
  look: SoftLook;
  /** The visible words. */
  label: string;
  /** What a screen reader says. */
  accessibilityLabel: string;
  testID?: string;
  /** The decorative mark drawn before the words: an `Icon`, or a dot. */
  leading?: ReactNode;
}

type Colors = Record<(typeof COLOR_KEYS)[number], string>;

function capsuleStyle(look: SoftLook, colors: Colors): ViewStyle {
  return {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    ...PILL,
    borderRadius: Radii.full,
    ...(look.fill ? { backgroundColor: colors[look.fill as keyof Colors] } : null),
    ...(look.edge
      ? {
          borderWidth: 1,
          borderColor: colors[look.edge as keyof Colors],
          borderStyle: look.dashed ? 'dashed' : 'solid',
        }
      : null),
  };
}

export function SoftLabel({
  look,
  label,
  accessibilityLabel,
  testID,
  leading,
}: SoftLabelProps) {
  const colors = useColors(COLOR_KEYS);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={capsuleStyle(look, colors)}>
      {leading}
      <Text variant="caption" capped tone={TEXT_TONE[look.ink]} className="shrink">
        {label}
      </Text>
    </View>
  );
}
