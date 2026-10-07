/**
 * `Card` and `Panel` - the containers of Atlas (feature 004; contract C4-8; FR-002,
 * FR-006, FR-018, FR-024, FR-033, FR-034), over the kit's Card (a Surface).
 *
 *   <Card>...</Card>                                       raised, on the canvas
 *   <Card variant="flat">...</Card>                        same fill, no shadow
 *   <Card overMap>...</Card>                               over the globe: opaque, hairline
 *   <Card pending>...</Card>                               not yet synchronised: dashed edge
 *   <Card accessibilityLabel="Lisbon, planning, 3 stops" onPress={open}>...</Card>
 *   <Panel title="Spending">...</Panel>                    a titled group, no fill
 *
 * Depth (FR-002). Two levels only: the canvas and a card above it. `raised` is the kit's
 * own surface: the `surface` fill and its soft shadow (`--surface-shadow`, which the
 * theme sets to nothing in the dark and increased-contrast themes). `flat` is the same
 * fill with the shadow cancelled by `shadow-none`: the kit's Surface carries
 * `box-shadow: var(--shadow-surface)` in its own stylesheet, so a card that must have no
 * shadow has to say so. Boundaries appear only where one is needed (FR-006): cards are
 * told apart by tone and spacing, so neither `raised` nor `flat` draws an edge.
 *
 * Over the globe (FR-018, FR-033). `overMap` is the opaque `bg-surface` with a hairline
 * `border-border` (3:1 against the surface and against light and dark map areas) and
 * `shadow-none`, whatever the variant: no shadow, tint, scrim or translucency crosses
 * the map. A test pins that no class carries an opacity suffix or a shadow.
 *
 * Pending (FR-034). `pending` swaps the edge for a dashed `border-pending`. It is only
 * the edge: the text-and-icon marker is `SyncBadge`, which a pending card still shows,
 * so the state never rests on a dashed line alone (FR-025).
 *
 * One card in another is a development error (`surface-nesting.tsx`, FR-006): a `Card`
 * never contains a card, however many `Panel`s sit between them.
 *
 * With `onPress` the card is ONE control: a `Tappable` (role `button`, `disabled` and
 * `busy` announced and inert, the scaled platform minimum target, a focus ring that
 * follows the card's corner) wrapping the surface, so there is one node to name, focus
 * and press, and `testID` lands on it (the surface inside it is `<testID>-surface`).
 * `accessibilityLabel` is then required, by the type and, in development, at run time.
 * A tappable card names its cue (FR-024): a trailing chevron in the muted ink
 * (`<testID>-cue`), unless `cue={false}` because the card supplies its own trailing
 * cue (a labelled control, an icon). A card with no `onPress` is a plain container and
 * announces nothing of its own; a notice may pass `accessibilityRole="alert"` and a
 * name. A held press swaps the card's fill to `surface-tertiary` at once, with no
 * transition (FR-019).
 *
 * `className` and `style` are layout (margin, position, size) and go on the outermost
 * node; never a colour. Colours here are semantic classes, never a literal.
 */
import { Card as KitCard } from 'heroui-native';
import type { ReactNode } from 'react';
import {
  View,
  type AccessibilityRole,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { cornerStyle } from '@/theme';

import { assertAccessibleName } from './adapter-guards';
import { PressCue } from './press-cue';
import { SurfaceBoundary, useSurfaceNestingGuard } from './surface-nesting';
import { Tappable } from './tappable';
import { Text } from './text';

export type CardVariant = 'raised' | 'flat';
export type CardRadius = 'md' | 'lg' | 'xl';

interface CardBaseProps {
  /** `raised` (default) carries the kit's soft shadow where the theme has one. */
  variant?: CardVariant;
  /** Floating over the globe or a map: opaque, hairline, never a shadow. */
  overMap?: boolean;
  /** Recorded on the device, not yet synchronised: a dashed edge. */
  pending?: boolean;
  /** Default `lg` (16 dp). */
  radius?: CardRadius;
  testID?: string;
  /** Layout classes only (`self-stretch`): never colour. */
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export interface PressableCardProps extends CardBaseProps {
  onPress: (event: GestureResponderEvent) => void;
  /** Required: what a screen reader says for the whole card. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** Unavailable: dimmed, announced unavailable, presses are ignored. */
  disabled?: boolean;
  /** An operation is in flight: presses are ignored, announced busy. */
  busy?: boolean;
  /** `false` when the card supplies its own trailing cue. Default `true`. */
  cue?: boolean;
}

export interface StaticCardProps extends CardBaseProps {
  onPress?: undefined;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  disabled?: undefined;
  busy?: undefined;
  cue?: undefined;
}

export type CardProps = PressableCardProps | StaticCardProps;

/** What decides a card's classes. */
export interface CardLook {
  variant: CardVariant;
  overMap: boolean;
  pending: boolean;
  /** A held press. */
  pressed: boolean;
}

/**
 * The semantic classes of a card, written out in full so Tailwind finds each one by
 * scanning the source. Exported so the mapping is asserted directly.
 */
export function cardClasses({ variant, overMap, pending, pressed }: CardLook): string {
  const fill = pressed ? 'bg-surface-tertiary' : 'bg-surface';
  const shadow = overMap || variant === 'flat' ? 'shadow-none' : '';
  const edge = pending
    ? 'border border-dashed border-pending'
    : overMap
      ? 'border border-border'
      : '';
  return [fill, shadow, edge].filter(Boolean).join(' ');
}

/** The pressed fill belongs to the card, so the control behind it paints nothing. */
const NO_CONTROL_FILL = { backgroundColor: 'transparent' } as const;

type SurfaceProps = CardBaseProps &
  Required<Pick<CardBaseProps, 'variant' | 'overMap' | 'pending' | 'radius'>> & {
    pressed?: boolean;
    /** Draw the trailing chevron; its testID is `cueTestID`. */
    showCue?: boolean;
    cueTestID?: string;
    accessibilityLabel?: string;
    accessibilityHint?: string;
    accessibilityRole?: AccessibilityRole;
  };

/** The chevron beside the content of a tappable card. */
function WithCue({ children, testID }: { children?: ReactNode; testID?: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1">{children}</View>
      <PressCue testID={testID} />
    </View>
  );
}

function CardSurface({
  variant,
  overMap,
  pending,
  radius,
  pressed = false,
  showCue = false,
  cueTestID,
  className,
  style,
  children,
  ...host
}: SurfaceProps) {
  const classes = cardClasses({ variant, overMap, pending, pressed });
  return (
    <KitCard
      variant={pressed ? 'tertiary' : 'default'}
      className={className ? `${classes} ${className}` : classes}
      style={[cornerStyle(radius), style]}
      {...host}>
      <SurfaceBoundary>
        {showCue ? <WithCue testID={cueTestID}>{children}</WithCue> : children}
      </SurfaceBoundary>
    </KitCard>
  );
}

function PressableCard({
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled,
  busy,
  cue = true,
  testID,
  className,
  style,
  variant = 'raised',
  overMap = false,
  pending = false,
  radius = 'lg',
  children,
}: PressableCardProps) {
  assertAccessibleName('Card', accessibilityLabel);
  return (
    <Tappable
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled}
      busy={busy}
      testID={testID}
      className={className}
      style={[cornerStyle(radius), NO_CONTROL_FILL, style]}>
      {({ pressed }) => (
        <CardSurface
          variant={variant}
          overMap={overMap}
          pending={pending}
          radius={radius}
          pressed={pressed}
          showCue={cue}
          cueTestID={testID ? `${testID}-cue` : undefined}
          testID={testID ? `${testID}-surface` : undefined}>
          {children}
        </CardSurface>
      )}
    </Tappable>
  );
}

/** A card with nothing to press: a plain container. */
function StaticCard({
  variant = 'raised',
  overMap = false,
  pending = false,
  radius = 'lg',
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  testID,
  className,
  style,
  children,
}: StaticCardProps) {
  return (
    <CardSurface
      variant={variant}
      overMap={overMap}
      pending={pending}
      radius={radius}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole={accessibilityRole}
      testID={testID}
      className={className}
      style={style}>
      {children}
    </CardSurface>
  );
}

export function Card(props: CardProps) {
  useSurfaceNestingGuard('Card');
  return props.onPress ? <PressableCard {...props} /> : <StaticCard {...props} />;
}

export interface PanelProps {
  /** A heading for the group; optional. */
  title?: string;
  testID?: string;
  /** Layout classes only: never colour. */
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * A flat, borderless grouping container: a title (`headline`, announced as a heading) over
 * its children, with a small gap. It draws no fill, edge or shadow, so it adds no depth
 * level and may sit on the canvas or inside a `Card`; its parent decides the inset. It is
 * a plain `View` on purpose: the kit's Surface clips its children, which would cut off
 * the shadow of a card placed in it.
 */
export function Panel({ title, className, style, testID, children }: PanelProps) {
  return (
    <View
      className={className ? `gap-2 ${className}` : 'gap-2'}
      style={style}
      testID={testID}>
      {title ? (
        <Text type="headline" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
