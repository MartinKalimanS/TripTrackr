/**
 * `Chip`, `ChipGroup` and `StatusChip` - the small labelled things of Sunrise Passport
 * (features 004 and 005; contract C5-16; FR-025, FR-026, FR-029, FR-030, FR-055, FR-063,
 * FR-065, FR-070, FR-074; 003 FR-017; review rules 2, 3, 5, 6 and 7). Feature 004 wrapped
 * the kit's Chip; the Sunrise chip is a React Native `Pressable` painted from tokens
 * (`chip-look.ts` decides which keys), because its look (an ink selection, a dashed "add",
 * the pressed fill) is not the kit's.
 *
 *   <Chip label="EUR" accessibilityLabel="Euro" selected onPress={pick} testID="currency-EUR" />
 *   <Chip label="Food" leading="fork-knife" accessibilityLabel="Food" onPress={pick} />
 *   <Chip label="Add" dashed leading="plus" accessibilityLabel="Add a city" onPress={add} />
 *   <ChipGroup options={OPTIONS} selectedKey={code} onSelect={setCode} scroll />
 *   <StatusChip status="active" dayOf={{ day: 3, of: 8 }} />
 *
 * `Chip` (an action or a choice)
 * - Unselected is cream with a hairline; selected is an `ink` fill with an `onInk` label and
 *   a check that takes the place of the leading glyph (as a Material filter chip does):
 *   NOT colour alone (FR-025). Both carry a border of the same width, so selecting never
 *   moves a pixel. The `dashed` chip (an "add") has no fill and a 1.5 dp dashed `border`.
 * - Name and role: `accessibilityLabel` is required (an error in development when blank);
 *   the role is `button`, or what the caller says (`radio`, `checkbox`), and without a press
 *   handler it is `text`, a label, because a button that does nothing is a lie. State carries
 *   `selected` (and `checked` for a radio) next to `disabled`. `testID` reaches the node.
 * - Touch target (FR-026): 40 dp visible, and slop around it up to the platform floor (44 iOS,
 *   48 Android) vertically and 4 dp (half the gap between chips) sideways; at large text the
 *   label wraps and the chip grows, the minimum is not scaled. Capped at 1.3 (FR-074).
 * - Pressed (FR-063): the `pressed` fill with an INK label, a selected chip included (only
 *   ink is gated on it), and the press scale .97 (the fill alone under reduced motion). Focus
 *   draws the ring of `focus-ring.ts`. Disabled is `opacity-disabled`, announced
 *   unavailable, and the press is dropped.
 * - `leading` is an `IconName` (drawn by `Icon`, in the ink of the chip) or any node.
 *
 * `ChipGroup` is a `radiogroup` container, each chip a `radio` announced
 * `{ selected, checked }`, the options' own ids and names, `onSelect(key)` on every press. A
 * CHANGE (not a re-press of the selected one) plays the selection haptic (FR-020; silent
 * under reduced motion, through `useHaptics`). It wraps onto further lines, or with
 * `scroll` it is one sideways row without a scroll bar and with
 * `keyboardShouldPersistTaps="handled"`, so a tap with the keyboard up is not swallowed. (The
 * fade at the clipped edge of C5-16 needs a gradient, which only `Scrim` may draw; T523.)
 *
 * `StatusChip` carries `testID="status-pill-<status>"` (the id the e2e flows have always
 * used), role `text`, the name "Status: <label>" ("Status: Active, day 3 of 8" with
 * `dayOf`), a mark and the word: a calendar for planning, the coral live dot for active, a
 * check for past (three shapes, FR-025). It is a label, not a control, so it has no floor.
 *
 * There is no colour literal here: every colour is a palette key (`useColors`).
 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type {
  AccessibilityRole,
  AccessibilityState,
  PressableProps,
  ViewStyle,
} from 'react-native';
import type { ReactNode } from 'react';

import { MinTouchTarget } from '@/constants/theme';
import { STATUS_PRESENTATION, type TripStatus } from '@/features/trips/trip-status';
import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';
import { useHaptics } from '@/hooks/use-haptics';
import { Space, cornerOf, pressScaleOf } from '@/theme';

import { assertAccessibleName } from './adapter-guards';
import { chipLook, STATUS_LOOKS, type ChipLook } from './chip-look';
import { focusRingStyle, useFocusRing, type FocusHandlers } from './focus-ring';
import { Icon, type IconName } from './icon';
import { isIconKey } from './icon-registry';
import { SoftLabel } from './soft-label';
import { Text, type TextTone } from './text';
import { useColors } from './theme-tokens';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: PressableProps['onPress'];
  /** An icon name or any node, shown before the label. */
  leading?: IconName | ReactNode;
  /** Required: what a screen reader says. Usually the visible label, or more. */
  accessibilityLabel: string;
  /** Default `button`, or `text` without `onPress`. */
  accessibilityRole?: AccessibilityRole;
  disabled?: boolean;
  /** The "add" chip: no fill, a dashed border. */
  dashed?: boolean;
  testID?: string;
  /** Layout classes only (`self-stretch`): never colour. */
  className?: string;
}

export interface ChipOption {
  key: string;
  label: string;
  testID: string;
  accessibilityLabel: string;
  /** An icon name or any node before the label (a category's glyph, the "Other" plus). */
  leading?: IconName | ReactNode;
  /** The "add" look: no fill, a dashed edge ("Other"). */
  dashed?: boolean;
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
  /** "Day 3 of 8", for an active trip in the hero. */
  dayOf?: { day: number; of: number };
}

/** The visible height of a chip; the rest of the target is slop around it (C5-16). */
const CHIP_HEIGHT = 40;
/** Half the 8 dp gap between chips: neighbours' slop never overlaps. */
const SLOP_X = 4;
const SLOP_Y = (MinTouchTarget - CHIP_HEIGHT) / 2;
const HIT_SLOP = { top: SLOP_Y, bottom: SLOP_Y, left: SLOP_X, right: SLOP_X } as const;

/** Every palette key a chip can paint with, asked of the kit in one call. */
const COLOR_KEYS = [
  'ink',
  'onInk',
  'surfaceSecondary',
  'hairline',
  'border',
  'pressed',
  'focus',
] as const;

type Colors = Record<(typeof COLOR_KEYS)[number], string>;

const LABEL_TONE: Record<ChipLook['label'], TextTone> = {
  ink: 'default',
  onInk: 'onInk',
};

interface ChipStyleInput {
  look: ChipLook;
  colors: Colors;
  interactive: boolean;
  scale: number;
  focused: boolean;
}

/** What the host node carries now. Exported so the mapping is asserted directly. */
export function chipStyle({
  look,
  colors,
  interactive,
  scale,
  focused,
}: ChipStyleInput): ViewStyle {
  return {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: CHIP_HEIGHT,
    ...(interactive ? { minWidth: MinTouchTarget } : null),
    paddingVertical: Space[2],
    paddingHorizontal: Space[4],
    ...cornerOf('full'),
    borderWidth: look.edgeWidth,
    borderColor: colors[look.edge as keyof Colors],
    ...(look.dashed ? { borderStyle: 'dashed' } : null),
    ...(look.fill ? { backgroundColor: colors[look.fill as keyof Colors] } : null),
    ...(scale === 1 ? null : { transform: [{ scale }] }),
    ...(focused ? focusRingStyle(colors.focus) : null),
  };
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
  look: ChipLook;
  testID?: string;
}

/** The check while selected, else the caller's glyph: an icon name or a node. */
function Leading({ selected, leading, look, testID }: LeadingProps) {
  if (selected) {
    return (
      <Icon
        name="check"
        size={16}
        tone={look.label}
        testID={testID ? `${testID}-check` : undefined}
      />
    );
  }
  if (isIconKey(leading)) {
    return (
      <Icon
        name={leading}
        size={16}
        tone={look.label}
        testID={testID ? `${testID}-icon` : undefined}
      />
    );
  }
  return <>{leading}</>;
}

interface BodyProps extends LeadingProps {
  label: string;
}

function ChipBody({ label, ...leading }: BodyProps) {
  return (
    <>
      <Leading {...leading} />
      <Text
        variant="label"
        strong
        capped
        tone={LABEL_TONE[leading.look.label]}
        className="shrink">
        {label}
      </Text>
    </>
  );
}

interface Surface {
  lookOf: (pressed: boolean) => ChipLook;
  styleOf: (pressed: boolean) => ViewStyle;
  focus: FocusHandlers;
}

interface SurfaceInput {
  selected: boolean;
  dashed: boolean;
  interactive: boolean;
  disabled: boolean;
}

/** Look and style of a chip for a held or resting press, from the active theme. */
function useChipSurface({
  selected,
  dashed,
  interactive,
  disabled,
}: SurfaceInput): Surface {
  const { prefersLessMotion } = useAccessibilityFlags();
  const colors = useColors(COLOR_KEYS);
  const focus = useFocusRing();
  const live = interactive && !disabled;
  const lookOf = (pressed: boolean) =>
    chipLook({ selected, dashed, pressed: pressed && live });
  const styleOf = (pressed: boolean) =>
    chipStyle({
      look: lookOf(pressed),
      colors,
      interactive,
      scale: pressed && live ? pressScaleOf(prefersLessMotion) : 1,
      focused: interactive && focus.focused,
    });
  return { lookOf, styleOf, focus };
}

type HostInput = Pick<
  ChipProps,
  'selected' | 'disabled' | 'accessibilityLabel' | 'testID' | 'className'
> & { role: AccessibilityRole };

/** The props both forms of a chip put on their host node. */
function hostProps({
  role,
  selected = false,
  disabled = false,
  accessibilityLabel,
  testID,
  className,
}: HostInput) {
  const classes = [disabled ? 'opacity-disabled' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return {
    testID,
    accessibilityRole: role,
    accessibilityLabel,
    accessibilityState: chipState(role, selected, disabled),
    className: classes || undefined,
  };
}

/** A chip with no press handler: a label, not a button that does nothing. */
function LabelChip(props: ChipProps) {
  const { label, selected = false, dashed = false, leading, testID } = props;
  const { lookOf, styleOf } = useChipSurface({
    selected,
    dashed,
    interactive: false,
    disabled: false,
  });
  const role = props.accessibilityRole ?? 'text';
  return (
    <View {...hostProps({ ...props, role })} accessible style={styleOf(false)}>
      <ChipBody
        label={label}
        selected={selected}
        leading={leading}
        look={lookOf(false)}
        testID={testID}
      />
    </View>
  );
}

function PressableChip(props: ChipProps & Required<Pick<ChipProps, 'onPress'>>) {
  const { label, selected = false, dashed = false, disabled = false, leading } = props;
  const { lookOf, styleOf, focus } = useChipSurface({
    selected,
    dashed,
    interactive: true,
    disabled,
  });
  const role = props.accessibilityRole ?? 'button';
  return (
    <Pressable
      {...hostProps({ ...props, role })}
      disabled={disabled ? true : undefined}
      onPress={disabled ? undefined : props.onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      hitSlop={HIT_SLOP}
      style={({ pressed }) => styleOf(pressed)}>
      {({ pressed }) => (
        <ChipBody
          label={label}
          selected={selected}
          leading={leading}
          look={lookOf(pressed)}
          testID={props.testID}
        />
      )}
    </Pressable>
  );
}

export function Chip(props: ChipProps) {
  assertAccessibleName('Chip', props.accessibilityLabel);
  return props.onPress === undefined ? (
    <LabelChip {...props} />
  ) : (
    <PressableChip {...props} onPress={props.onPress} />
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
      leading={option.leading}
      dashed={option.dashed}
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

const DOT = 8;
const HALO = 3;
const COLOR_KEYS_DOT = ['accentLine', 'accentTint'] as const;

/** The coral live dot of an active trip: 8 dp with a 3 dp halo (decorative). */
function LiveDot() {
  const colors = useColors(COLOR_KEYS_DOT);
  return (
    <View
      testID="status-pill-active-dot"
      accessible={false}
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

export function StatusChip({ status, dayOf }: StatusChipProps) {
  const { label } = STATUS_PRESENTATION[status];
  const look = STATUS_LOOKS[status];
  const day = status === 'active' ? dayOf : undefined;
  const words = day ? `${label} · Day ${day.day} of ${day.of}` : label;
  const spoken = day ? `${label}, day ${day.day} of ${day.of}` : label;
  return (
    <SoftLabel
      look={look}
      label={words}
      accessibilityLabel={`Status: ${spoken}`}
      testID={`status-pill-${status}`}
      leading={
        look.icon ? <Icon name={look.icon} size={16} tone={look.ink} /> : <LiveDot />
      }
    />
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space[2] },
  row: { flexDirection: 'row', gap: Space[2] },
});
