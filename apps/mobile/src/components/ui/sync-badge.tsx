/**
 * Pending-synchronisation marker - contract C11 (002), FR-007; restyled for Atlas by T421
 * and for Sunrise Passport by T520 (contract C5-16; FR-025, FR-029, FR-030, FR-034, FR-065;
 * review rules 3 and 5).
 *
 * Why a styling feature ships this component: Constitution Principle II forbids
 * presenting a record as saved before its bytes have landed. A visual language
 * built entirely out of "soft, settled, finished" surfaces will imply exactly
 * that unless something explicitly says otherwise.
 *
 * This reflects state the caller owns. It does not query, compute, or influence
 * synchronisation - that boundary is the whole reason it is safe for a
 * presentation layer to show it.
 *
 * What it announces and the ids it carries are stable (e2e flows and tests read them): the
 * badge is a text node named "Sync pending", "Sync in progress" or "Sync failed" (what
 * assistive technology and the tests read), its icon is `sync-badge-icon`, and the visible
 * words ("Not yet synced", "Syncing", "Sync failed") are what the Maestro flows look for.
 *
 * The look is a small capsule (`SoftLabel`): an icon and the words, `amberInk` on `amberTint`
 * for a record that is waiting or on its way, `danger` on `dangerTint` for one that failed,
 * each with a DASHED edge in its line colour (`amberLine`, `danger`), like every other
 * pending marker, so the state is a shape and a glyph as well as a hue (FR-025). Each state
 * has its own icon (a clock, a sync, an alert). Every pair is measured by
 * `test/theme/chip-contrast.test.ts`.
 *
 * `glyphOnly` is the form for a photograph (FR-007, FR-008): no words, a 24 dp disc, so the
 * marker never covers a face. Waiting and syncing are a white glyph on the `scrimButton`
 * disc; failed is the `dangerInk` glyph on a `danger` disc (P5), which is the one that must
 * not be missed. The announcement, the role and the id are the same.
 *
 * Layout: it hugs its content instead of stretching across a column, and grows with the
 * text size; nothing about it is fixed but the disc, which holds one glyph.
 */
import { View } from 'react-native';

import { Radii } from '@/theme';

import { SYNC_BADGE_LOOKS } from './chip-look';
import { Icon } from './icon';
import { SoftLabel } from './soft-label';
import { useColors } from './theme-tokens';

export type SyncState = 'pending' | 'syncing' | 'failed';

export type SyncBadgeProps = {
  state: SyncState;
  /** For a photograph: the glyph in a 24 dp disc, with no words. */
  glyphOnly?: boolean;
};

interface Presentation {
  label: string;
  announce: string;
}

/**
 * Each state carries an icon AND a message. Neither is decoration: FR-025
 * forbids conveying state by hue alone, and a traveller checking whether their
 * note is safe should not have to distinguish two similar violets.
 */
const PRESENTATION: Record<SyncState, Presentation> = {
  pending: { label: 'Not yet synced', announce: 'Sync pending' },
  syncing: { label: 'Syncing', announce: 'Sync in progress' },
  failed: { label: 'Sync failed', announce: 'Sync failed' },
};

const DISC = 24;
const COLOR_KEYS = ['scrimButton', 'danger'] as const;

/** The glyph-only form: a 24 dp disc on a photograph. */
function GlyphDisc({ state }: { state: SyncState }) {
  const colors = useColors(COLOR_KEYS);
  const failed = state === 'failed';
  const { announce } = PRESENTATION[state];
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={announce}
      style={{
        width: DISC,
        height: DISC,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radii.full,
        backgroundColor: failed ? colors.danger : colors.scrimButton,
      }}>
      <Icon
        testID="sync-badge-icon"
        name={SYNC_BADGE_LOOKS[state].icon}
        size={16}
        tone={failed ? 'dangerInk' : 'onPhoto'}
      />
    </View>
  );
}

export function SyncBadge({ state, glyphOnly = false }: SyncBadgeProps) {
  if (glyphOnly) return <GlyphDisc state={state} />;

  const look = SYNC_BADGE_LOOKS[state];
  const { label, announce } = PRESENTATION[state];
  return (
    <SoftLabel
      look={look}
      label={label}
      accessibilityLabel={announce}
      leading={
        <Icon testID="sync-badge-icon" name={look.icon} size={16} tone={look.ink} />
      }
    />
  );
}
