/**
 * The runtime half of the state sweep's first guard (feature 005, T559; FR-064, FR-080 as
 * amended by Q-11; not a test file): of everything a state renders, which pressables a
 * traveller could tap that do nothing.
 *
 * A React Native `Pressable` always draws a host node with press events, so the host props
 * cannot tell a button with a handler from one without. The component that drew the host can:
 * every control of the app (`Button`, `IconButton`, `Tappable`, a chip, a row, a tile, the tab)
 * is a `Pressable`, and a `Pressable` that announces itself as something to activate (a role of
 * button, link, radio, tab and the like) and is neither given an `onPress` (or `onLongPress`,
 * `onPressIn`) nor disabled is a dead end. A static row of a list group is drawn by the kit as a
 * pressable too, with no role and not focusable: it is not a control and is not held to this. The adapters pass their handler through as `onPress`
 * and `disabled` through as `disabled`, and a busy control is also `disabled` (`Tappable`), so
 * the question is the same for every one of them. The renderer exposes hosts only, so each host
 * is followed up its fibre to the `Pressable` that drew it (`unstable_fiber`, the same door
 * Testing Library uses to find a press handler).
 *
 *   await render(<TripsScreen />);
 *   expect(deadControls()).toEqual([]);
 *
 * Each entry names the control as a screen reader would hear it (`accessibilityLabel`, then
 * `testID`), so a failure says which one to fix.
 */
import { screen } from '@testing-library/react-native';

type Props = Record<string, unknown>;

/** The part of a React fibre this reads. */
interface FiberLike {
  type: unknown;
  memoizedProps: Props | null;
  return: FiberLike | null;
}

interface HostLike {
  unstable_fiber: unknown;
  queryAll: (predicate: () => boolean) => HostLike[];
}

const HANDLERS = ['onPress', 'onLongPress', 'onPressIn'] as const;

/** The roles that tell a traveller "this can be activated". */
const CONTROL_ROLES: ReadonlySet<unknown> = new Set([
  'button',
  'link',
  'radio',
  'checkbox',
  'switch',
  'tab',
  'menuitem',
  'imagebutton',
  'togglebutton',
  'combobox',
  'adjustable',
]);

function isControl(props: Props): boolean {
  return CONTROL_ROLES.has(props.accessibilityRole ?? props.role);
}

/**
 * `Pressable` is a memoised component whose function (or, in another build, whose `forwardRef`
 * render function) carries the name.
 */
function isPressableType(type: unknown): boolean {
  if (typeof type === 'function') {
    return (
      type.name === 'Pressable' ||
      (type as { displayName?: string }).displayName === 'Pressable'
    );
  }
  if (typeof type !== 'object' || type === null || !('render' in type)) return false;
  return (type as { render?: { name?: string } }).render?.name === 'Pressable';
}

/**
 * `Button` wraps the caller's handler in its own (the press haptic comes first), so its
 * `Pressable` always has an `onPress` and the caller's is on the `Button` above it.
 */
function isButtonControl(type: unknown): boolean {
  return typeof type === 'function' && type.name === 'ButtonControl';
}

/**
 * What the traveller was given to press: the props of the `Pressable` that drew this host node,
 * with the handler the CALLER gave a `Button` in place of the one it wrapped. Null when no
 * `Pressable` drew the host.
 */
function pressableOf(host: HostLike): Props | null {
  let fiber = (host.unstable_fiber as FiberLike | null)?.return ?? null;
  let pressable: Props | null = null;
  while (fiber !== null && typeof fiber.type !== 'string') {
    if (isPressableType(fiber.type)) pressable = fiber.memoizedProps ?? {};
    if (pressable !== null && isButtonControl(fiber.type)) {
      return { ...pressable, onPress: fiber.memoizedProps?.onPress };
    }
    fiber = fiber.return;
  }
  return pressable;
}

/** Every `Pressable` on screen, hidden ones included, once each. */
function pressables(): Props[] {
  const container = screen.container as unknown as HostLike;
  const seen = new Set<Props>();
  for (const host of container.queryAll(() => true)) {
    const props = pressableOf(host);
    if (props !== null) seen.add(props);
  }
  return [...seen];
}

function hasHandler(props: Props): boolean {
  return HANDLERS.some((name) => typeof props[name] === 'function');
}

function isDisabled(props: Props): boolean {
  if (props.disabled === true) return true;
  const state = props.accessibilityState as { disabled?: boolean } | undefined;
  return state?.disabled === true;
}

function nameOf(props: Props): string {
  const label = props.accessibilityLabel ?? props['aria-label'];
  if (typeof label === 'string' && label !== '') return `"${label}"`;
  if (typeof props.testID === 'string') return `#${props.testID}`;
  return '(unnamed pressable)';
}

/** Every pressable on screen with no handler that is not disabled, named. Empty when none is dead. */
export function deadControls(): string[] {
  return pressables()
    .filter((props) => isControl(props) && !hasHandler(props) && !isDisabled(props))
    .map(nameOf);
}

/** How many pressables are on screen: a guard that finds none has proved nothing. */
export function pressableCount(): number {
  return pressables().length;
}

/** What a coming-soon control says about itself (`COMING_SOON_HINT`). */
const COMING_SOON_HINT = 'Not available yet';
const COMING_SOON_ID = /^coming-soon-/;

interface HostProps {
  props: Props;
}

function hostsOnScreen(): HostProps[] {
  const container = screen.container as unknown as {
    queryAll: (predicate: () => boolean) => HostProps[];
  };
  return container.queryAll(() => true);
}

/**
 * The runtime half of the second guard: a control that SAYS it is not available yet must be a
 * coming-soon control (its id is `coming-soon-<name>`), and one with that id must say so. A
 * pictured control without a capability that went round `ComingSoonButton` would do one or the
 * other differently. Each entry names the control.
 */
export function misroutedComingSoon(): string[] {
  return hostsOnScreen()
    .filter(({ props }) => {
      const says = props.accessibilityHint === COMING_SOON_HINT;
      const id = typeof props.testID === 'string' && COMING_SOON_ID.test(props.testID);
      // An icon, label or toast part of a coming-soon control carries the id with a suffix and
      // no role: only a pressable (it has a role) is held to the pair.
      const control = props.accessibilityRole === 'button' || says;
      return control && says !== id;
    })
    .map(({ props }) => nameOf(props));
}

/** The buttons on screen drawn as the primary (FR-005 allows one per screen state), named. */
export function primaryControls(): string[] {
  return hostsOnScreen()
    .filter(
      ({ props }) => props.accessibilityRole === 'button' && props.variant === 'primary',
    )
    .map(({ props }) => nameOf(props));
}
