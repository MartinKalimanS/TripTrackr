/**
 * Empty, loading and error presentations and their skeletons (feature 004; contract
 * C4-8 and C4-10 rule 2; FR-021, FR-025, FR-029, FR-030, FR-035; research D4-02), in the
 * Sunrise look of feature 005 (contract C5-28; FR-064, FR-065; research D5-14).
 *
 * These are styled to the same standard as populated screens rather than left as bare
 * defaults, which is where they usually end up. Providing them as primitives is what
 * makes FR-035 enforceable on screens that do not exist yet: a screen either composes
 * one of these or it has no defined state, and the difference is visible in review.
 *
 *   <EmptyState title="No trips yet" detail="Plan one." icon={Map}
 *               action={{ label: 'Plan a trip', onPress: plan }} />
 *   <EmptyState variant="frames" title="No photos yet" />       art above the words
 *   <LoadingState title="Loading trips" />
 *   <ErrorState title="Could not load trips" detail="..." onRetry={reload} />
 *   <ListSkeleton variant="card" rows={3} label="Loading trips" />
 *
 * What they guarantee:
 * - One flat surface (`bg-surface rounded-2xl p-6 items-center gap-2`): no border, no
 *   shadow, and nothing card-shaped inside it (FR-006). Colours are semantic classes.
 * - `EmptyState` names the next action: an optional `action` is a SECONDARY `Button`
 *   named by its label (never a second primary, FR-005; a screen with no other primary may
 *   say `primary: true`) and an optional decorative `icon`. `variant` picks the art above
 *   the words (`state-art.tsx`, all decorative and hidden from assistive technology):
 *   `plain` (none, the default and what every call site had), `ghost-stamp` (a dashed
 *   stamp outline: a trip with no stops, an empty passport), `frames` (three tilted empty
 *   photo frames: no photographs) and `filtered` (a magnifier: a filter or a search with
 *   no result). The words are the title (`callout`) and the detail (`body`, muted). `ErrorState` is not colour alone (FR-025): a leading alert icon, the title
 *   in the danger ink, and a secondary "Try again" button when a retry is possible. The
 *   accessible name of that button and the container roles are unchanged from before
 *   (FR-030), so screens, tests and Maestro flows still find them.
 * - `LoadingState` is ONE announced region: the container is `accessible`, a
 *   `progressbar` named by its title, and the kit `Spinner` (itself a progressbar) is
 *   hidden from assistive technology so it is not read twice. An optional `detail` is the
 *   region's value text (the name stays the title), and `spinner={false}` leaves the
 *   spinner out (a traveller who asked for less motion).
 * - The gates (first sync, local store) add three optional things, all off by default:
 *   a `testID` and an `accessibilityLiveRegion` on the surface of any state, a `busy` flag on an
 *   `EmptyState` action and a `retryBusy` flag on an `ErrorState`, so a retry that is
 *   under way is announced busy and ignores a second press (FR-019).
 * - Skeletons (`TripCardSkeleton`, `RowSkeleton`, `ListSkeleton`) are shaped like the
 *   content they stand in for, from `ShimmerGroup` and `Bone` (`skeleton.tsx`: the
 *   `skeleton` fill and the 1.4 s shimmer). The screen skeletons are in
 *   `screen-skeletons.tsx`. Each is also ONE
 *   announced `progressbar` named `label` (default "Loading"), and every shape inside
 *   is hidden from assistive technology: a list of twelve boxes is one busy region, not
 *   twelve anonymous focus stops. Under reduced motion (`useAppearance`) and under the
 *   provider's `animation: 'disable-all'` (D4-05) there is no shimmer and no fade, so the
 *   shapes stay as static placeholders. Skeletons carry no text, so the largest text size
 *   cannot clip them; the content that replaces them reflows as usual.
 */
import { Spinner } from 'heroui-native';
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { ALERT_ICON } from './alert-icon';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Bone, ShimmerGroup } from './skeleton';
import { StateArt, type EmptyVariant } from './state-art';
import { Text } from './text';

/** Continuous corners are the kit's own on its views; a plain `View` asks for them. */
const CONTINUOUS = { borderCurve: 'continuous' } as const;

const STATE_BOX = 'bg-surface rounded-2xl p-6 items-center gap-2';

/**
 * What a gate may put on the surface of a state, passed straight to it: an id (a flow
 * waits on it) and a live region (Android reads a change of the words; iOS needs a
 * separate announcement). Both are off by default.
 */
type SurfaceProps = Pick<ViewProps, 'testID' | 'accessibilityLiveRegion'>;

type StateViewProps = SurfaceProps & {
  title: string;
  detail?: string;
};

export type StateAction = {
  label: string;
  /** What a screen reader says when it is more than the visible `label`. */
  accessibilityLabel?: string;
  onPress: () => void;
  testID?: string;
  /** The action is under way: announced busy, presses are ignored. */
  busy?: boolean;
  /** The screen's one primary: only where the screen has no other. Default secondary. */
  primary?: boolean;
};

export type EmptyStateProps = StateViewProps & {
  /** The art above the words. Default `plain`: none. */
  variant?: EmptyVariant;
  /** A decorative glyph above the title. */
  icon?: IconName;
  /** The next step, drawn as a secondary button named by its label. */
  action?: StateAction;
};

export type ErrorStateProps = StateViewProps & {
  onRetry?: () => void;
  /** The retry is under way: announced busy, presses are ignored. */
  retryBusy?: boolean;
};

export type LoadingStateProps = Partial<StateViewProps> & {
  /** Draw the spinner. Default true; a traveller who asked for less motion gets none. */
  spinner?: boolean;
};

/** The flat surface every state sits on; accessibility props pass straight through. */
export function StateBox({ children, ...rest }: ViewProps) {
  return (
    <View className={STATE_BOX} style={CONTINUOUS} {...rest}>
      {children}
    </View>
  );
}

export function Detail({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <Text variant="body" tone="muted" className="text-center">
      {children}
    </Text>
  );
}

/** Nothing here yet — and that is a normal, designed state, not a failure. */
export function EmptyState({
  variant = 'plain',
  title,
  detail,
  icon,
  action,
  ...surface
}: EmptyStateProps) {
  return (
    <StateBox {...surface}>
      <StateArt
        variant={variant}
        testID={surface.testID ? `${surface.testID}-art` : undefined}
      />
      {icon ? <Icon name={icon} size={24} tone="muted" /> : null}
      <Text variant="callout" className="text-center">
        {title}
      </Text>
      <Detail>{detail}</Detail>
      {action ? (
        <Button
          variant={action.primary ? 'primary' : 'secondary'}
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          testID={action.testID}
          busy={action.busy}
          onPress={() => action.onPress()}
          className="mt-2">
          {action.label}
        </Button>
      ) : null}
    </StateBox>
  );
}

/**
 * Work in progress. Announced, so it is not a silent pause for a screen reader: ONE
 * region named by the title (the name a flow or a test looks for is unchanged), with the
 * detail, when there is one, as its value text, which a screen reader reads after the name.
 */
export function LoadingState({
  title = 'Loading',
  detail,
  spinner = true,
  ...surface
}: LoadingStateProps) {
  return (
    <StateBox
      accessible
      accessibilityLabel={title}
      accessibilityValue={detail ? { text: detail } : undefined}
      accessibilityRole="progressbar"
      {...surface}>
      {spinner ? (
        <Spinner
          size="md"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      <Text variant="label" tone="muted" className="text-center">
        {title}
      </Text>
      <Detail>{detail}</Detail>
    </StateBox>
  );
}

/**
 * Something failed. The words and the icon are the signal, not the colour (FR-025), and
 * a retry is offered rather than leaving the traveller at a dead end.
 */
export function ErrorState({
  title,
  detail,
  onRetry,
  retryBusy,
  ...surface
}: ErrorStateProps) {
  return (
    <StateBox {...surface}>
      <Icon name={ALERT_ICON} size={24} tone="danger" />
      <Text variant="callout" tone="danger" className="text-center">
        {title}
      </Text>
      <Detail>{detail}</Detail>
      {onRetry ? (
        <Button
          variant="secondary"
          accessibilityLabel="Try again"
          busy={retryBusy}
          onPress={() => onRetry()}
          className="mt-2">
          Try again
        </Button>
      ) : null}
    </StateBox>
  );
}

// ---------------------------------------------------------------- skeletons

const DEFAULT_ROWS = 3;

export type SkeletonRegionProps = {
  /** What a screen reader says for the whole placeholder. Default "Loading". */
  label?: string;
  testID?: string;
};

export type ListSkeletonProps = SkeletonRegionProps & {
  /** How many placeholders; default 3. A fraction is truncated, a negative is none. */
  rows?: number;
  /** The shape of each: a trip card or a plain list row. */
  variant: 'card' | 'row';
};

type RegionProps = SkeletonRegionProps & {
  /** Spacing between the shapes, when there are several. */
  gap?: string;
  /** Layout classes for the region itself (`flex-1` for a skeleton that fills a screen). */
  className?: string;
  children?: ReactNode;
};

/**
 * The single announced region: focusable as one `progressbar`, with every shape inside
 * hidden from assistive technology (both platforms' flags).
 */
export function LoadingRegion({
  label = 'Loading',
  testID,
  gap,
  className,
  children,
}: RegionProps) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className={className}
      testID={testID}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className={gap}>
        {children}
      </View>
    </View>
  );
}

/** A trip card: cover beside a title, a status chip and a line of dates and stops. */
function TripCardBones() {
  return (
    <ShimmerGroup
      className="flex-row items-center gap-4 rounded-3xl bg-surface p-4"
      style={CONTINUOUS}>
      <Bone className="size-16 rounded-2xl" />
      <View className="flex-1 gap-2">
        <Bone className="h-5 w-3/4 rounded-lg" />
        <Bone className="h-4 w-1/3 rounded-full" />
        <Bone className="h-4 w-1/2 rounded-lg" />
      </View>
    </ShimmerGroup>
  );
}

/** A list row: a leading shape beside a title and a second line. */
function RowBones() {
  return (
    <ShimmerGroup className="flex-row items-center gap-3 py-3">
      <Bone className="size-10 rounded-full" />
      <View className="flex-1 gap-2">
        <Bone className="h-4 w-2/3 rounded-lg" />
        <Bone className="h-3 w-1/2 rounded-lg" />
      </View>
    </ShimmerGroup>
  );
}

/** A trip card while it loads. */
export function TripCardSkeleton(props: SkeletonRegionProps) {
  return (
    <LoadingRegion {...props}>
      <TripCardBones />
    </LoadingRegion>
  );
}

/** A list row while it loads. */
export function RowSkeleton(props: SkeletonRegionProps) {
  return (
    <LoadingRegion {...props}>
      <RowBones />
    </LoadingRegion>
  );
}

function rowCount(rows: number): number {
  return Number.isFinite(rows) ? Math.max(0, Math.trunc(rows)) : DEFAULT_ROWS;
}

/** A list while it loads: `rows` placeholders under ONE announced region. */
export function ListSkeleton({
  rows = DEFAULT_ROWS,
  variant,
  ...region
}: ListSkeletonProps) {
  const Bones = variant === 'card' ? TripCardBones : RowBones;
  return (
    <LoadingRegion gap={variant === 'card' ? 'gap-3' : undefined} {...region}>
      {Array.from({ length: rowCount(rows) }, (_, index) => (
        <Bones key={index} />
      ))}
    </LoadingRegion>
  );
}
