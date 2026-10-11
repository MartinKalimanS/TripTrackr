/**
 * `ListGroup` and `ListRow` - grouped rows of Atlas (feature 004; contract C4-8; FR-013,
 * FR-024, FR-025, FR-029, FR-030), over the kit's ListGroup.
 *
 *   <ListGroup header="Account">
 *     <ListRow title="Notes" description="4 notes" onPress={openNotes} testID="open-notes" />
 *     <ListRow title="Version" trailing={<Text tone="muted">1.0.0</Text>} />
 *     <ListRow title="Delete account" tone="destructive" onPress={confirmDelete} />
 *   </ListGroup>
 *
 * `ListGroup` is one raised surface (the kit's, in a continuous `lg` corner) that holds
 * its rows and draws an inset kit `Separator` BETWEEN them (after none, before none): pass
 * the rows themselves, or arrays of them; a row wrapped in a Fragment counts as one child.
 * An optional `header` is a muted caption above the group, announced as a heading. A
 * group is a raised container like a `Card`, so the two share the nesting rule
 * (`surface-nesting.tsx`, FR-006): one inside the other is a development error.
 *
 * `ListRow` is the title (`headline`, wraps, no line limit, no fixed height), an optional
 * `description` (`callout`, muted), an optional `leading` node and an optional `trailing`
 * node. What the kit's Item leaves out, the adapter supplies:
 * - With `onPress` the row is ONE control: role `button`, `disabled` announced and inert
 *   (dimmed with `opacity-disabled`), a minimum height of the platform floor (44 dp iOS,
 *   48 dp Android) scaled by the font scale like `Tappable`, a held press that swaps the
 *   fill to `surface-tertiary` at once (FR-019), and a 2 dp focus ring in the `focus`
 *   token. The ring is drawn INSIDE the row: the group clips its rows to its rounded
 *   corners, which would cut off a ring drawn outside, and inside it still only touches
 *   the row's own neutral fill (review rule 6).
 * - It names its cue (FR-024): the default trailing chevron in the muted ink, unless the
 *   row supplies its own `trailing` node.
 * - `accessibilityActions` and `onAccessibilityAction` reach the host node untouched, so
 *   a stop row keeps move up, move down, edit and delete as actions on the row.
 *   `accessibilityLabel` and `accessibilityHint` are the caller's; with no label the
 *   platform reads the row's own text, trailing text included, so nothing is dropped.
 * - A row with no `onPress` is not a control: no role, not focusable, no pressed fill and
 *   never announced unavailable. It is ONE element for assistive technology only when it
 *   is given an `accessibilityLabel` or actions; otherwise its texts and a trailing
 *   control (a switch) stay individually reachable, which a grouped parent would hide.
 * - `busy` (an operation is in flight, FR-019) announces the row busy and unavailable, ignores
 *   presses and swaps the trailing node for a small spinner (`<testID>-spinner`, hidden from
 *   assistive technology: the caller's title, "Signing out...", says it in words). It is not
 *   dimmed, like a busy `Button`. Only a row with an `onPress` is a control, so only it can be busy.
 * - `tone="destructive"` writes the title in `text-danger` AND leads with an icon
 *   (a caution glyph, unless the caller passes its own `leading`), so the tone is never
 *   colour alone (FR-025); the title is the caller's own label of what the row does.
 *
 * `testID` lands on the row. The default chevron is `<testID>-cue` and the destructive
 * icon `<testID>-icon`. Colours are semantic classes and `useThemeColor`, never a literal.
 */
import {
  ListGroup as KitListGroup,
  Separator,
  Spinner,
  useThemeColor,
} from 'heroui-native';
import { Children, useState, type ReactNode } from 'react';
import {
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { FocusRing, cornerStyle } from '@/theme';

import { Icon, type IconName } from './icon';
import { PressCue } from './press-cue';
import { SurfaceBoundary, useSurfaceNestingGuard } from './surface-nesting';
import { Text } from './text';

export interface ListGroupProps {
  /** A caption above the group: a muted heading; optional. */
  header?: string;
  testID?: string;
  /** Layout classes only (`self-stretch`): never colour. */
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** The rows. A separator is drawn between each pair. */
  children?: ReactNode;
}

/** The separator starts where the row's content does: the row's 16 dp padding. */
const SEPARATOR_INSET = 'ms-4';

/** Rows with a separator between each pair; what renders nothing is skipped. */
function withSeparators(children: ReactNode, testID?: string): ReactNode[] {
  return Children.toArray(children).flatMap((child, index) =>
    index === 0
      ? [child]
      : [
          <Separator
            key={`separator-${index}`}
            className={SEPARATOR_INSET}
            testID={testID ? `${testID}-separator-${index}` : undefined}
          />,
          child,
        ],
  );
}

export function ListGroup({
  header,
  testID,
  className,
  style,
  children,
}: ListGroupProps) {
  useSurfaceNestingGuard('ListGroup');
  const group = (
    <KitListGroup
      className={className}
      style={[cornerStyle('lg'), style]}
      testID={testID}>
      <SurfaceBoundary>{withSeparators(children, testID)}</SurfaceBoundary>
    </KitListGroup>
  );
  if (!header) return group;
  return (
    <View className="gap-2">
      <Text type="caption" tone="muted" accessibilityRole="header">
        {header}
      </Text>
      {group}
    </View>
  );
}

export type ListRowTone = 'default' | 'destructive';

export interface ListRowProps {
  title: string;
  description?: string;
  /** Before the text: an icon, an avatar. */
  leading?: ReactNode;
  /** After the text. With `onPress` and none, a chevron is shown. */
  trailing?: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  /** `destructive` writes the title in the danger ink and leads with an icon. */
  tone?: ListRowTone;
  /** Unavailable: dimmed, announced unavailable, presses are ignored. */
  disabled?: boolean;
  /** An operation is in flight: presses are ignored, announced busy, a spinner shows. */
  busy?: boolean;
  testID?: string;
}

const CAUTION: IconName = { ios: 'exclamationmark.triangle', android: 'warning' };

/** A pressed row swaps its fill at once; the class is literal so Tailwind finds it. */
const PRESSED_CLASS = 'active:bg-surface-tertiary';

function rowClasses(pressable: boolean, disabled: boolean): string | undefined {
  const classes = [pressable ? PRESSED_CLASS : '', disabled ? 'opacity-disabled' : ''];
  return classes.filter(Boolean).join(' ') || undefined;
}

/** The leading slot: the caller's node, or the caution icon of a destructive row. */
function Leading({
  leading,
  destructive,
  testID,
}: {
  leading?: ReactNode;
  destructive: boolean;
  testID?: string;
}) {
  const node =
    leading ??
    (destructive ? (
      <Icon
        name={CAUTION}
        size={20}
        tone="danger"
        testID={testID ? `${testID}-icon` : undefined}
      />
    ) : null);
  return node ? <KitListGroup.ItemPrefix>{node}</KitListGroup.ItemPrefix> : null;
}

/** The busy indicator: decorative, the row's title already says what is happening. */
function BusyIndicator({ rowId }: { rowId?: string }) {
  return (
    <Spinner
      size="sm"
      testID={rowId ? `${rowId}-spinner` : undefined}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** The trailing slot: a spinner while busy, the caller's node, or a pressable row's chevron. */
function Trailing({
  trailing,
  pressable,
  busy,
  testID,
}: {
  trailing?: ReactNode;
  pressable: boolean;
  busy: boolean;
  testID?: string;
}) {
  const node = busy ? (
    <BusyIndicator rowId={testID} />
  ) : (
    (trailing ??
    (pressable ? <PressCue testID={testID ? `${testID}-cue` : undefined} /> : null))
  );
  return node ? <KitListGroup.ItemSuffix>{node}</KitListGroup.ItemSuffix> : null;
}

/** What the row announces: nothing for a plain row; `busy` joins `disabled` only while busy. */
function rowState(pressable: boolean, disabled: boolean, working: boolean) {
  if (!pressable) return undefined;
  return working ? { disabled: true, busy: true } : { disabled };
}

export function ListRow({
  title,
  description,
  leading,
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityActions,
  onAccessibilityAction,
  tone = 'default',
  disabled = false,
  busy = false,
  testID,
}: ListRowProps) {
  const { fontScale } = useAppearance();
  const focusColor = useThemeColor('focus');
  const [focused, setFocused] = useState(false);
  const pressable = onPress !== undefined;
  const grouped =
    pressable || accessibilityLabel !== undefined || accessibilityActions !== undefined;
  const inert = pressable && disabled;
  const working = pressable && busy;
  const destructive = tone === 'destructive';

  return (
    <KitListGroup.Item
      testID={testID}
      accessible={grouped}
      focusable={pressable}
      accessibilityRole={pressable ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      accessibilityState={rowState(pressable, disabled, working)}
      disabled={pressable ? disabled || working : undefined}
      onPress={inert || working ? undefined : onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={rowClasses(pressable, inert)}
      style={[
        pressable ? { minHeight: MinTouchTarget * Math.max(1, fontScale) } : null,
        pressable && focused ? focusRing(focusColor) : null,
      ]}>
      <Leading leading={leading} destructive={destructive} testID={testID} />
      <KitListGroup.ItemContent>
        <Text type="headline" tone={destructive ? 'danger' : 'default'}>
          {title}
        </Text>
        {description ? (
          <Text type="callout" tone="muted">
            {description}
          </Text>
        ) : null}
      </KitListGroup.ItemContent>
      <Trailing
        trailing={trailing}
        pressable={pressable}
        busy={working}
        testID={testID}
      />
    </KitListGroup.Item>
  );
}

/** The focus ring, inset: see the header for why not `FocusRing.offset` outside. */
function focusRing(color: string): ViewStyle {
  return {
    outlineWidth: FocusRing.width,
    outlineOffset: -FocusRing.width,
    outlineColor: color,
    outlineStyle: 'solid',
  };
}
