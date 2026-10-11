/**
 * `Chip`, `ChipGroup` and `StatusChip` - the small labelled things of Atlas (feature 004;
 * contract C4-8; FR-019, FR-020, FR-025, FR-026, FR-029, FR-030; 003 FR-017; review rules
 * 2, 3, 5 and 7), over the kit's Chip. They are the pill choices and the status label of
 * every screen.
 *
 *   <Chip label="EUR" accessibilityLabel="Euro" selected onPress={pick} testID="currency-EUR" />
 *   <Chip label="Food" leading={FOOD_ICON} accessibilityLabel="Food" onPress={pick} />
 *   <ChipGroup options={OPTIONS} selectedKey={code} onSelect={setCode} scroll />
 *   <StatusChip status="active" />
 *
 * `Chip` (an action or a choice)
 * - Selected is NOT colour alone (FR-025): a filled accent chip, a heavier label
 *   (`font-semibold`) and a check glyph that takes the place of the leading glyph, as a
 *   Material filter chip does. Unselected is outlined in `border`, which the gate measures
 *   at 3:1 on canvas, surface and field fill (FR-024; a tone-on-tone chip would not reach
 *   it). Both carry a border, so selecting never moves a pixel. Neither is a soft chip:
 *   those have a 15% fill, belong on canvas, surface or overlay only, and are not used for
 *   a chip that can sit on a field (review rule 7).
 * - Name and role: `accessibilityLabel` is required (an error in development when blank);
 *   the role is `button`, or what the caller says (`radio`, `checkbox`), and without a
 *   press handler it is `text`, because a button that does nothing is a lie. State
 *   carries `selected` (and `checked` for a radio) next to `disabled`. The kit's chip sets
 *   no role at all, and `testID` reaches the pressable.
 * - Touch target (FR-026): the kit chip has NO height, only padding around a line of text
 *   (about 28 dp), so an interactive chip asks for a MINIMUM of the platform floor (44 iOS,
 *   48 Android) each way, plus 4 dp of slop on every side. At large text the label grows
 *   the chip and wraps (`shrink`); the minimum is not scaled, because the content already
 *   is. The chip is the Pressable itself, so it is the node that gets the floor.
 * - Feedback (FR-019): a press swaps to a fixed fill at once (`accent-hover` on the accent
 *   fill, `surface-tertiary` on the outline; both are gated for their text), never the
 *   kit's 20% soft hover (review rule 5). A focused chip draws a ring `FocusRing.width`
 *   thick, `FocusRing.offset` OUTSIDE it, like `Tappable` (`overflow-visible` undoes the
 *   kit's clipping of its root, which would cut the ring off). Disabled is `opacity-disabled`,
 *   announced unavailable, and the press is dropped.
 * - `leading` is an `IconName` (drawn by `Icon`, in the ink that reads on the chip's
 *   fill) or any node.
 *
 * `ChipGroup` is a `radiogroup` container, each chip a `radio`
 * announced `{ selected, checked }`, the options' own ids and names, `onSelect(key)` on
 * every press. A CHANGE (not a re-press of the selected one) plays the selection haptic
 * (FR-020; silent under reduced motion, through `useHaptics`). It wraps onto further
 * lines, or with `scroll` it is one sideways row without a scroll bar and with
 * `keyboardShouldPersistTaps="handled"`, so a tap with the keyboard up is not swallowed.
 *
 * `StatusChip` carries `testID="status-pill-<status>"` (the id the e2e flows have always
 * used), role `text`, the name "Status: <label>", an icon and the word. It is a label, not
 * a control, so it has no floor. The tint is the status ink on its 15% soft fill, exactly
 * the pairs the contrast gate measures on every neutral fill (C4-3): `status-active`,
 * `status-past`, and for planning the INK variant (`status-planning-ink`), never the mark
 * colour.
 *
 * Colours come from semantic classes and `Icon` tones; there is no literal here.
 */
import { Chip as KitChip } from 'heroui-native';
import { useState, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { STATUS_PRESENTATION, type TripStatus } from '@/features/trips/trip-status';
import { useHaptics } from '@/hooks/use-haptics';
import { AtlasSpacing, FocusRing } from '@/theme';

import { assertAccessibleName } from './adapter-guards';
import { Icon, type IconName, type IconTone } from './icon';
import { Text } from './text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: PressableProps['onPress'];
  /** An icon (both platforms) or any node, shown before the label. */
  leading?: IconName | ReactNode;
  /** Required: what a screen reader says. Usually the visible label, or more. */
  accessibilityLabel: string;
  /** Default `button`, or `text` without `onPress`. */
  accessibilityRole?: AccessibilityRole;
  disabled?: boolean;
  testID?: string;
  /** Layout classes only (`self-stretch`): never colour. */
  className?: string;
}

export interface ChipOption {
  key: string;
  label: string;
  testID: string;
  accessibilityLabel: string;
}

export interface ChipGroupProps {
  options: readonly ChipOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** One sideways row, no scroll bar, instead of wrapping. */
  scroll?: boolean;
  /** Names the group (Android reads it; iOS ignores a label on a container). */
  accessibilityLabel?: string;
  testID?: string;
}

export interface StatusChipProps {
  status: TripStatus;
}

const CHECK: IconName = { ios: 'checkmark', android: 'check' };

/** Half the 8 dp gap between chips: neighbours' slop never overlaps. */
const SLOP = 4;
const HIT_SLOP = { top: SLOP, bottom: SLOP, left: SLOP, right: SLOP } as const;

/**
 * Literal strings, so Tailwind finds each class; the pressed fills are gated for their
 * text. `overflow-visible` undoes the kit's `overflow: hidden` (it only clips a theme
 * background layer we never use) so the focus ring drawn outside the chip is not clipped.
 */
const OUTLINE = {
  selected: 'overflow-visible border border-accent',
  unselected: 'overflow-visible border border-border',
};
const PRESSED = {
  selected: 'active:bg-accent-hover',
  unselected: 'active:bg-surface-tertiary',
};

function isIconName(value: unknown): value is IconName {
  return (
    typeof value === 'object' && value !== null && 'ios' in value && 'android' in value
  );
}

/**
 * The frame of a chip: the platform floor for an interactive one, nothing for a label,
 * and the focus ring while it is focused. Exported so the mapping is asserted directly.
 */
export function chipFrame(interactive: boolean): ViewStyle {
  return interactive ? { minHeight: MinTouchTarget, minWidth: MinTouchTarget } : {};
}

const FOCUS_STYLE: ViewStyle = {
  outlineWidth: FocusRing.width,
  outlineOffset: FocusRing.offset,
  outlineStyle: 'solid',
};

interface ChipLook {
  selected: boolean;
  interactive: boolean;
  disabled: boolean;
  className?: string;
}

function chipClasses({ selected, interactive, disabled, className }: ChipLook): string {
  const key = selected ? 'selected' : 'unselected';
  return [
    OUTLINE[key],
    interactive ? PRESSED[key] : '',
    disabled ? 'opacity-disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

function chipState(
  role: AccessibilityRole,
  selected: boolean,
  disabled: boolean,
): AccessibilityState {
  return {
    selected,
    ...(role === 'radio' || role === 'checkbox' ? { checked: selected } : {}),
    ...(disabled ? { disabled: true } : {}),
  };
}

interface LeadingProps {
  selected: boolean;
  leading: IconName | ReactNode;
  testID?: string;
}

/** The check while selected, else the caller's glyph: an icon name or a node. */
function Leading({ selected, leading, testID }: LeadingProps) {
  if (selected) {
    return (
      <Icon
        name={CHECK}
        size={16}
        tone="onAccent"
        testID={testID ? `${testID}-check` : undefined}
      />
    );
  }
  if (isIconName(leading)) {
    return (
      <Icon
        name={leading}
        size={16}
        tone="default"
        testID={testID ? `${testID}-icon` : undefined}
      />
    );
  }
  return <>{leading}</>;
}

export function Chip({
  label,
  selected = false,
  onPress,
  leading,
  accessibilityLabel,
  accessibilityRole,
  disabled = false,
  testID,
  className,
}: ChipProps) {
  assertAccessibleName('Chip', accessibilityLabel);

  const [focused, setFocused] = useState(false);
  const interactive = onPress !== undefined;
  const role = accessibilityRole ?? (interactive ? 'button' : 'text');

  return (
    <KitChip
      variant={selected ? 'primary' : 'tertiary'}
      color={selected ? 'accent' : 'default'}
      size="md"
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={chipState(role, selected, disabled)}
      disabled={disabled ? true : undefined}
      onPress={disabled ? undefined : onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hitSlop={interactive ? HIT_SLOP : undefined}
      className={chipClasses({ selected, interactive, disabled, className })}
      style={[chipFrame(interactive), focused && interactive ? FOCUS_STYLE : null]}
      testID={testID}>
      <Leading selected={selected} leading={leading} testID={testID} />
      <KitChip.Label className={selected ? 'shrink font-semibold' : 'shrink'}>
        {label}
      </KitChip.Label>
    </KitChip>
  );
}

export function ChipGroup({
  options,
  selectedKey,
  onSelect,
  scroll = false,
  accessibilityLabel,
  testID,
}: ChipGroupProps) {
  const haptics = useHaptics();

  const select = (key: string) => {
    if (key !== selectedKey) haptics.selection();
    onSelect(key);
  };

  const chips = options.map((option) => (
    <Chip
      key={option.key}
      label={option.label}
      testID={option.testID}
      accessibilityLabel={option.accessibilityLabel}
      accessibilityRole="radio"
      selected={option.key === selectedKey}
      onPress={() => select(option.key)}
    />
  ));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      testID={testID}>
      {scroll ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.row}>
          {chips}
        </ScrollView>
      ) : (
        <View style={styles.wrap}>{chips}</View>
      )}
    </View>
  );
}

interface StatusLook {
  icon: IconName;
  tone: IconTone;
  /** The soft fill (15%) and the ink, as literal classes for Tailwind to find. */
  fill: string;
  ink: string;
}

const STATUS_LOOK: Record<TripStatus, StatusLook> = {
  planning: {
    icon: { ios: 'calendar', android: 'calendar_month' },
    tone: 'statusPlanning',
    fill: 'bg-status-planning-ink/15',
    ink: 'text-status-planning-ink',
  },
  active: {
    icon: { ios: 'location.fill', android: 'location_on' },
    tone: 'statusActive',
    fill: 'bg-status-active/15',
    ink: 'text-status-active',
  },
  past: {
    icon: { ios: 'checkmark.circle', android: 'check_circle' },
    tone: 'statusPast',
    fill: 'bg-status-past/15',
    ink: 'text-status-past',
  },
};

const BADGE = 'flex-row items-center self-start gap-1 rounded-full px-2 py-0.5';

export function StatusChip({ status }: StatusChipProps) {
  const { label } = STATUS_PRESENTATION[status];
  const look = STATUS_LOOK[status];
  return (
    <View
      testID={`status-pill-${status}`}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
      className={`${BADGE} ${look.fill}`}>
      <Icon name={look.icon} size={16} tone={look.tone} />
      <Text type="caption" className={look.ink}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: AtlasSpacing.two },
  row: { flexDirection: 'row', gap: AtlasSpacing.two },
});
