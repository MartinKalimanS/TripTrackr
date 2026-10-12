/**
 * `ListGroup` and `ListRow` - grouped rows (feature 004; contract C4-8; FR-013, FR-024,
 * FR-025, FR-029, FR-030), in the Sunrise look of feature 005 (contract C5-18; FR-055,
 * FR-069), over the kit's ListGroup.
 *
 *   <ListGroup header="Account">
 *     <ListRow title="Notes" description="4 notes" onPress={openNotes} testID="open-notes" />
 *     <ListRow title="Version" trailing={<Text tone="muted">1.0.0</Text>} />
 *     <ListRow title="Delete account" tone="destructive" onPress={confirmDelete} />
 *   </ListGroup>
 *
 * `ListGroup` is a tile: the kit's surface in the cream `secondary` fill, a hairline edge,
 * no shadow and a continuous 24 dp corner (the prototype's settings groups; a white group
 * on a white canvas would have only its edge to stand on). It holds its rows and draws an
 * inset kit `Separator` BETWEEN them (after none, before none): pass the rows themselves,
 * or arrays of them; a row wrapped in a Fragment counts as one child. An optional `header`
 * is a muted label above the group, announced as a heading. A group is a surface like a
 * `Card`, so the two share the nesting rule (`surface-nesting.tsx`, FR-006): one inside
 * the other is a development error.
 *
 * `ListRow` is the title (`callout`, wraps, no line limit, no fixed height), an optional
 * `description` (`label`, muted), an optional `leading` node and an optional `trailing`
 * node, in a row at least 60 dp tall (scaled by the font scale: a minimum, never a height).
 * What the kit's Item leaves out, the adapter supplies:
 * - With `onPress` the row is ONE control: role `button`, `disabled` announced and inert
 *   (dimmed with `opacity-disabled`), the 60 dp minimum height (above the platform floor)
 *   scaled by the font scale like `Tappable`, a held press that swaps the fill to the
 *   `pressed` fill (`surface-tertiary`) at once (FR-019) and the description to the default
 *   ink while it is held (only `ink` text sits on a pressed fill, review rule 7), and a 2 dp
 *   focus ring in the `focus` token. The ring is drawn INSIDE the row: the group clips its rows to its rounded
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

import { useAppearance } from '@/hooks/use-appearance';
import { FocusRing, cornerOf } from '@/theme';

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

/** The cream fill, the hairline, and the kit's own surface shadow cancelled. */
const GROUP_CLASSES = 'bg-surface-secondary border border-separator shadow-none';

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
      variant="secondary"
      className={className ? `${GROUP_CLASSES} ${className}` : GROUP_CLASSES}
      style={[cornerOf('xl'), style]}
      testID={testID}>
      <SurfaceBoundary>{withSeparators(children, testID)}</SurfaceBoundary>
    </KitListGroup>
  );
  if (!header) return group;
  return (
    <View className="gap-2">
      <Text variant="label" strong tone="muted" accessibilityRole="header">
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
export const ROW_PRESSED_CLASS = 'active:bg-surface-tertiary';

/** The row is at least 60 dp tall; the kit's 16 dp padding is tightened to 8 above and below. */
export const ROW_MIN_HEIGHT = 60;

function rowClasses(pressable: boolean, disabled: boolean): string | undefined {
  const classes = [
    'py-2',
    pressable ? ROW_PRESSED_CLASS : '',
    disabled ? 'opacity-disabled' : '',
  ];
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

/** The title and the description: the description leaves the muted ink while held. */
function RowText({
  title,
  description,
  destructive,
  held,
}: {
  title: string;
  description?: string;
  destructive: boolean;
  held: boolean;
}) {
  return (
    <KitListGroup.ItemContent>
      <Text variant="callout" tone={destructive ? 'danger' : 'default'}>
        {title}
      </Text>
      {description ? (
        <Text variant="label" tone={held ? 'default' : 'muted'}>
          {description}
        </Text>
      ) : null}
    </KitListGroup.ItemContent>
  );
}

interface RowBodyProps {
  leading?: ReactNode;
  title: string;
  description?: string;
  trailing?: ReactNode;
  destructive: boolean;
  held: boolean;
  pressable: boolean;
  working: boolean;
  testID?: string;
}

/** What is inside the row: the leading slot, the words and the trailing slot. */
function RowBody(row: RowBodyProps) {
  return (
    <>
      <Leading leading={row.leading} destructive={row.destructive} testID={row.testID} />
      <RowText
        title={row.title}
        description={row.description}
        destructive={row.destructive}
        held={row.held}
      />
      <Trailing
        trailing={row.trailing}
        pressable={row.pressable}
        busy={row.working}
        testID={row.testID}
      />
    </>
  );
}

interface RowFlags {
  pressable: boolean;
  disabled: boolean;
  busy: boolean;
  /** Named, or given actions: one element for assistive technology even without a press. */
  named: boolean;
  onPress?: ListRowProps['onPress'];
}

/** The role, the state and the press of the host row, and the two states that gate them. */
function rowHost({ pressable, disabled, busy, named, onPress }: RowFlags) {
  const inert = pressable && disabled;
  const working = pressable && busy;
  return {
    inert,
    working,
    props: {
      accessible: pressable || named,
      focusable: pressable,
      accessibilityRole: pressable ? ('button' as const) : undefined,
      accessibilityState: rowState(pressable, disabled, working),
      disabled: pressable ? disabled || working : undefined,
      onPress: inert || working ? undefined : onPress,
    },
  };
}

/** Focus and a held press, which only a pressable row has: the ring and the ink on the fill. */
function useRowFeedback(pressable: boolean) {
  const { fontScale } = useAppearance();
  const focusColor = useThemeColor('focus');
  const [focused, setFocused] = useState(false);
  const [held, setHeld] = useState(false);
  return {
    held: held && pressable,
    style: [
      { minHeight: ROW_MIN_HEIGHT * Math.max(1, fontScale) },
      pressable && focused ? focusRing(focusColor) : null,
    ],
    handlers: {
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      onPressIn: pressable ? () => setHeld(true) : undefined,
      onPressOut: pressable ? () => setHeld(false) : undefined,
    },
  };
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
  const pressable = onPress !== undefined;
  const feedback = useRowFeedback(pressable);
  const named = accessibilityLabel !== undefined || accessibilityActions !== undefined;
  const { inert, working, props } = rowHost({
    pressable,
    disabled,
    busy,
    named,
    onPress,
  });
  const destructive = tone === 'destructive';

  return (
    <KitListGroup.Item
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      {...props}
      {...feedback.handlers}
      className={rowClasses(pressable, inert)}
      style={feedback.style}>
      <RowBody
        {...{ leading, title, description, trailing, destructive, pressable, working }}
        held={feedback.held}
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
