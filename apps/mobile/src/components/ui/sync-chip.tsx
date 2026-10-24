/**
 * `SyncChip` - the one global synchronisation chip of a screen (feature 005, T520; contract
 * C5-16; data-model section 8; FR-026, FR-029, FR-065, FR-071), at its top right. It shows
 * how many changes are still on this device, in words and a glyph, and offers "Retry" when a
 * sync failed.
 *
 *   <SyncChip state={{ kind: 'waiting', count: 3 }} />
 *   <SyncChip state={{ kind: 'failed', count: 2 }} onRetry={retry} />
 *
 * - `synced` draws nothing. `waiting`: a cloud-up glyph and the count. `syncing`: the spinner
 *   and the count. `offline`: a wifi-off glyph in `amberInk` and the count (none when nothing
 *   waits). `failed`: the `danger` alert, a `dangerTint` over the paper, a `danger` edge and
 *   the verb "Retry".
 * - Announced "3 changes waiting to sync" (1 change), "Syncing 3 changes", "Offline, 3 changes
 *   waiting to sync" or "Sync failed, retry": ONE element, named in words, id `sync-chip`. The
 *   figure is tabular so the chip does not jitter as it counts down. ONE chip per screen (a
 *   review rule): a second would be two answers to one question.
 * - Only `failed` with an `onRetry` is a control: a button, with 4 dp of slop and the focus
 *   ring; every other state is a `text` label, because a chip that says "waiting" and does
 *   nothing when pressed must not announce itself as a button.
 * - 36 dp at least and growing with the text size, 92 percent paper with `lift1` so it floats
 *   over the globe or a cover without a hard edge; the tint of `failed` is laid OVER the paper
 *   (the gate measures `danger` on `dangerTint` over `surface`, P4).
 *
 * It reads the state it is given and writes nothing, queries nothing (Constitution I and II).
 * The state is `SyncChipState` of `features/sync/use-sync-chip-state.ts`, which derives it from
 * the local store, the network and the sync runtime (T529); the type is imported, not owned
 * here, so the adapter stays ignorant of where it comes from.
 */
import { Spinner } from 'heroui-native';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import type { SyncChipState } from '@/features/sync/use-sync-chip-state';
import { useAppearance } from '@/hooks/use-appearance';
import { Radii, withAlpha, type PaletteName } from '@/theme';

import { focusRingStyle, useFocusRing } from './focus-ring';
import { Icon, type IconName, type IconTone } from './icon';
import { liftStyle } from './lift-style';
import { useOpaqueSurfaces } from './solid-ground';
import { Text, type TextTone } from './text';
import { useColors } from './theme-tokens';

export interface SyncChipProps {
  state: SyncChipState;
  /** Makes a `failed` chip a button that retries; ignored by every other state. */
  onRetry?: () => void;
}

type Visible = Exclude<SyncChipState, { kind: 'synced' }>;

const MIN_HEIGHT = 36;
const SLOP = { top: 4, bottom: 4, left: 4, right: 4 } as const;
/** The opacity of paper over what the chip floats on (C5-16: 92 percent). */
const PAPER_OPACITY = 0.92;
/** The prototype's `.sync-chip`: `padding: 6px 12px 6px 10px; gap: 6px`. */
const PADDING = { paddingVertical: 6, paddingLeft: 10, paddingRight: 12 } as const;

const COLOR_KEYS = ['surface', 'dangerTint', 'danger', 'muted', 'focus'] as const;
type Colors = Record<(typeof COLOR_KEYS)[number], string>;

interface Face {
  /** The glyph, or `null` where the spinner stands in. */
  icon: IconName | null;
  ink: IconTone;
  tone: TextTone;
  /** The figure or the verb shown beside the mark, or `null`. */
  text: string | null;
}

const plural = (count: number) => `${count} ${count === 1 ? 'change' : 'changes'}`;

/** What each state shows. */
function faceOf(state: Visible): Face {
  switch (state.kind) {
    case 'waiting':
      return {
        icon: 'cloud-upload',
        ink: 'muted',
        tone: 'muted',
        text: String(state.count),
      };
    case 'syncing':
      return { icon: null, ink: 'muted', tone: 'muted', text: String(state.count) };
    case 'offline':
      return {
        icon: 'wifi-off',
        ink: 'amberInk',
        tone: 'amber',
        text: state.count > 0 ? String(state.count) : null,
      };
    case 'failed':
      return { icon: 'alert', ink: 'danger', tone: 'danger', text: 'Retry' };
  }
}

/** The words a screen reader says. */
export function syncChipLabel(state: Visible): string {
  switch (state.kind) {
    case 'waiting':
      return `${plural(state.count)} waiting to sync`;
    case 'syncing':
      return state.count > 0 ? `Syncing ${plural(state.count)}` : 'Syncing';
    case 'offline':
      return state.count > 0
        ? `Offline, ${plural(state.count)} waiting to sync`
        : 'Offline';
    case 'failed':
      return 'Sync failed, retry';
  }
}

function chipStyle(
  failed: boolean,
  colors: Colors,
  theme: PaletteName,
  focused: boolean,
  opaque: boolean,
): ViewStyle {
  return {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: MIN_HEIGHT,
    ...PADDING,
    borderRadius: Radii.full,
    // Paper at 92 percent over what it floats on; solid under increased contrast or reduced
    // transparency (FR-072, FR-073).
    backgroundColor: opaque ? colors.surface : withAlpha(colors.surface, PAPER_OPACITY),
    // Failed has an edge; the others keep its width, so a state change moves no pixel.
    borderWidth: 1,
    borderColor: failed ? colors.danger : 'transparent',
    ...liftStyle(theme, 'lift1'),
    ...(focused ? focusRingStyle(colors.focus) : null),
  };
}

interface ContentProps {
  face: Face;
  failed: boolean;
  colors: Colors;
}

/** The tint (failed only), the glyph or the spinner, and the figure or the verb. */
function SyncChipContent({ face, failed, colors }: ContentProps) {
  return (
    <>
      {failed ? (
        <View
          testID="sync-chip-tint"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            styles.tint,
            { backgroundColor: colors.dangerTint },
          ]}
        />
      ) : null}
      {face.icon ? (
        <Icon name={face.icon} size={16} tone={face.ink} />
      ) : (
        <Spinner
          size="sm"
          color={colors.muted}
          testID="sync-chip-spinner"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      )}
      {face.text === null ? null : (
        <Text
          variant="caption"
          capped
          tone={face.tone}
          className="shrink"
          style={failed ? undefined : { fontVariant: ['tabular-nums'] }}>
          {face.text}
        </Text>
      )}
    </>
  );
}

function VisibleSyncChip({ state, onRetry }: SyncChipProps & { state: Visible }) {
  const { themeName } = useAppearance();
  const colors = useColors(COLOR_KEYS);
  const opaque = useOpaqueSurfaces();
  const focus = useFocusRing();
  const failed = state.kind === 'failed';
  const content = (
    <SyncChipContent face={faceOf(state)} failed={failed} colors={colors} />
  );

  if (!failed || onRetry === undefined) {
    return (
      <View
        testID="sync-chip"
        accessible
        accessibilityRole="text"
        accessibilityLabel={syncChipLabel(state)}
        style={chipStyle(failed, colors, themeName, false, opaque)}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID="sync-chip"
      accessibilityRole="button"
      accessibilityLabel={syncChipLabel(state)}
      onPress={onRetry}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      hitSlop={SLOP}
      style={chipStyle(failed, colors, themeName, focus.focused, opaque)}>
      {content}
    </Pressable>
  );
}

export function SyncChip({ state, onRetry }: SyncChipProps) {
  if (state.kind === 'synced') return null;
  return <VisibleSyncChip state={state} onRetry={onRetry} />;
}

const styles = StyleSheet.create({
  tint: { borderRadius: Radii.full },
});
