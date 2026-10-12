/**
 * `Card` and `Panel` - the containers of Sunrise Passport (feature 005; contract C5-18;
 * FR-003, FR-006, FR-018, FR-024, FR-033, FR-034, FR-055, FR-069), over the kit's Card
 * (a Surface). Feature 004 introduced them; the API is the same, the look is new.
 *
 *   <Card>...</Card>                                       lift: surface, hairline, lift1
 *   <Card variant="tile">...</Card>                        cream, hairline, no shadow
 *   <Card variant="flat">...</Card>                        no fill, no edge, no shadow
 *   <Card overMap>...</Card>                               over the globe: opaque, hairline, lift2
 *   <Card pending>...</Card>                               not yet synchronised: dashed amber edge
 *   <Card accessibilityLabel="Lisbon, planning, 3 stops" onPress={open}>...</Card>
 *   <Panel title="Spending">...</Panel>                    a titled group, no fill
 *
 * Depth (FR-003). Two lifts and nothing else (`lift.ts`): `lift1` is the card, `lift2` is a
 * card over the map. The kit's Surface carries `box-shadow: var(--shadow-surface)` in its own
 * stylesheet, so every card says `shadow-none` and takes its lift in `style`: a card never
 * stacks two shadows. A hairline edge (`border-separator`, the palette's `hairline`, which
 * the two contrast themes make explicit at 3:1) is always drawn with a lift or a tile; a
 * `flat` card draws none.
 *
 * Corners. `lift` is 24 dp (a card), `tile` and `flat` 16 dp (a tile), `radius` asks for
 * `md` (12), `lg` (16), `xl` (24) or `sheet` (28); all on the continuous curve.
 *
 * Over the globe (FR-018, FR-033). `overMap` is the opaque `surface` fill with the hairline
 * and `lift2`, whatever the variant: nothing translucent, tinted or scrimmed crosses the
 * map. A test pins that no class carries an opacity suffix.
 *
 * Pending (FR-034). `pending` swaps the hairline for a dashed `amber-line` edge (3:1 on the
 * surface and on cream). It is only the edge: the text-and-icon marker is `SyncBadge`, which
 * a pending card still shows, so the state never rests on a dashed line alone (FR-025).
 *
 * One card in another is a development error (`surface-nesting.tsx`, FR-006): a `Card`
 * never contains a card, however many `Panel`s sit between them.
 *
 * With `onPress` the card is ONE control: a `Tappable` (role `button`, `disabled` and
 * `busy` announced and inert, the scaled platform minimum target, a focus ring that follows
 * the card's corner) wrapping the surface, so there is one node to name, focus and press,
 * and `testID` lands on it (the surface inside it is `<testID>-surface`). `accessibilityLabel`
 * is then required, by the type and, in development, at run time. A tappable card names its
 * cue (FR-024): a trailing chevron in the muted ink (`<testID>-cue`), unless `cue={false}`
 * because the card supplies its own trailing cue. A card with no `onPress` is a plain
 * container and announces nothing of its own; a notice may pass `accessibilityRole="alert"`
 * and a name. A held press swaps the card's fill to the `pressed` fill
 * (`surface-tertiary`) at once, with no transition (FR-019). The card's own children keep the
 * tones they were given, so a `muted` line on a pressed card is the one pair the contrast
 * themes measure short (6.68:1 on the pressed sand, `test/ui-kit/pressed-fills-chip-row-card`).
 *
 * `className` and `style` are layout (margin, position, size) and go on the outermost
 * node (the control, for a pressable card); never a colour. `innerClassName` and
 * `innerStyle` go on the surface inside it, for what only the surface can take: the
 * kit's 16 dp padding (`p-0`), a ring. Colours here are semantic classes, never a literal.
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

import { cornerOf, type LiftName, type RadiiName } from '@/theme';

import { assertAccessibleName } from './adapter-guards';
import { useLiftStyle } from './lift';
import { PressCue } from './press-cue';
import { SurfaceBoundary, useSurfaceNestingGuard } from './surface-nesting';
import { Tappable } from './tappable';
import { Text } from './text';

export type CardVariant = 'lift' | 'tile' | 'flat';
export type CardRadius = Extract<RadiiName, 'md' | 'lg' | 'xl' | 'sheet'>;

interface CardBaseProps {
  /** `lift` (default), `tile` (cream, no shadow) or `flat` (no fill, edge or shadow). */
  variant?: CardVariant;
  /** Floating over the globe or a map: opaque, hairline, the second lift. */
  overMap?: boolean;
  /** Recorded on the device, not yet synchronised: a dashed amber edge. */
  pending?: boolean;
  /** Default 24 dp for `lift`, 16 dp for `tile` and `flat`. */
  radius?: CardRadius;
  testID?: string;
  /** Layout classes only (`self-stretch`): never colour. */
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** On the surface itself, inside the control of a pressable card (`p-0`). Never colour. */
  innerClassName?: string;
  innerStyle?: StyleProp<ViewStyle>;
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

const RADIUS_OF_VARIANT: Record<CardVariant, CardRadius> = {
  lift: 'xl',
  tile: 'lg',
  flat: 'lg',
};

const FILL_OF_VARIANT: Record<CardVariant, string> = {
  lift: 'bg-surface',
  tile: 'bg-surface-secondary',
  flat: '',
};

/** The kit Surface variant that matches the fill, so the kit paints nothing else. */
function kitVariantOf({ variant, overMap, pressed }: CardLook) {
  if (pressed) return 'tertiary';
  if (overMap) return 'default';
  return { lift: 'default', tile: 'secondary', flat: 'transparent' }[variant] as
    'default' | 'secondary' | 'transparent';
}

/** The lift a card carries: the first for a card, the second over the map, none otherwise. */
function liftNameOf({ variant, overMap }: CardLook): LiftName | null {
  if (overMap) return 'lift2';
  return variant === 'lift' ? 'lift1' : null;
}

/**
 * The semantic classes of a card, written out in full so Tailwind finds each one by
 * scanning the source. Exported so the mapping is asserted directly.
 */
export function cardClasses(look: CardLook): string {
  const { variant, overMap, pending, pressed } = look;
  const fill = pressed
    ? 'bg-surface-tertiary'
    : overMap
      ? 'bg-surface'
      : FILL_OF_VARIANT[variant];
  const edge = pending
    ? 'border border-dashed border-amber-line'
    : variant === 'flat' && !overMap
      ? ''
      : 'border border-separator';
  return [fill, 'shadow-none', edge].filter(Boolean).join(' ');
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
  innerClassName,
  innerStyle,
  children,
  ...host
}: SurfaceProps) {
  const look = { variant, overMap, pending, pressed };
  const classes = [cardClasses(look), innerClassName, className]
    .filter(Boolean)
    .join(' ');
  const lift = useLiftStyle(liftNameOf(look));
  return (
    <KitCard
      variant={kitVariantOf(look)}
      className={classes}
      style={[cornerOf(radius), lift, innerStyle, style]}
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
  innerClassName,
  innerStyle,
  variant = 'lift',
  overMap = false,
  pending = false,
  radius = RADIUS_OF_VARIANT[variant],
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
      style={[cornerOf(radius), NO_CONTROL_FILL, style]}>
      {({ pressed }) => (
        <CardSurface
          variant={variant}
          overMap={overMap}
          pending={pending}
          radius={radius}
          pressed={pressed}
          showCue={cue}
          cueTestID={testID ? `${testID}-cue` : undefined}
          innerClassName={innerClassName}
          innerStyle={innerStyle}
          testID={testID ? `${testID}-surface` : undefined}>
          {children}
        </CardSurface>
      )}
    </Tappable>
  );
}

/** A card with nothing to press: a plain container. */
function StaticCard({
  variant = 'lift',
  overMap = false,
  pending = false,
  radius = RADIUS_OF_VARIANT[variant],
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  testID,
  className,
  style,
  innerClassName,
  innerStyle,
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
      style={style}
      innerClassName={innerClassName}
      innerStyle={innerStyle}>
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
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
