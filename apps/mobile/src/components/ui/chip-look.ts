/**
 * The look of the chip family as data (feature 005, T520; contract C5-16; FR-025, FR-055,
 * FR-063, FR-065, FR-069, FR-070; design-tokens C5-4 P3, P4, P6, P12, P14, P18).
 *
 * Each table answers WHICH PALETTE KEYS paint, not which colours, so a rule such as "only
 * ink text ever sits on a pressed fill" is a property of the table, asserted once
 * (`chip-look.test.ts`) and then measured in all four themes with no exception list
 * (`test/theme/chip-contrast.test.ts`, `test/theme/adapter-pressed-fills.test.ts`). The
 * adapters (`chip.tsx`, `segmented-pill.tsx`, `sync-badge.tsx`, `privacy-chip.tsx`) turn the
 * keys into the colours of the active theme.
 *
 * Two kinds of thing live here. A CHOICE (`Chip`, a `SegmentedPill` segment) has states: at
 * rest, selected, held. A SOFT LABEL (`StatusChip`, `SyncBadge`, `PrivacyChip`) is a tint
 * with an ink on it, an optional edge and an icon, and no states: it is not pressable.
 */
import type { TripStatus } from '@/features/trips/trip-status';

import type { IconName } from './icon';
import type { PaletteKey } from './theme-tokens';

// ------------------------------------------------------------------------------------
// Chip
// ------------------------------------------------------------------------------------

export interface ChipState {
  selected: boolean;
  /** The "add" chip: no fill, a dashed border. */
  dashed: boolean;
  pressed: boolean;
}

/** The two inks a chip label takes: ink, or onInk on the selected ink fill. */
export type ChipLabelKey = 'ink' | 'onInk';

export interface ChipLook {
  /** The fill, or `null` for none (the ground shows through). */
  fill: PaletteKey | null;
  label: ChipLabelKey;
  edge: PaletteKey;
  edgeWidth: number;
  dashed: boolean;
}

const HAIRLINE = 1;
const DASH = 1.5;

/**
 * A held chip is always the `pressed` fill with an ink label (only ink is gated on it, P6),
 * a selected one included. The edge keeps its width and its dash, so a press moves no pixel.
 */
export function chipLook({ selected, dashed, pressed }: ChipState): ChipLook {
  if (dashed && !selected) {
    return {
      fill: pressed ? 'pressed' : null,
      label: 'ink',
      edge: 'border',
      edgeWidth: DASH,
      dashed: true,
    };
  }
  if (pressed) {
    return {
      fill: 'pressed',
      label: 'ink',
      edge: 'hairline',
      edgeWidth: HAIRLINE,
      dashed: false,
    };
  }
  if (selected) {
    return {
      fill: 'ink',
      label: 'onInk',
      edge: 'ink',
      edgeWidth: HAIRLINE,
      dashed: false,
    };
  }
  return {
    fill: 'surfaceSecondary',
    label: 'ink',
    edge: 'hairline',
    edgeWidth: HAIRLINE,
    dashed: false,
  };
}

// ------------------------------------------------------------------------------------
// SegmentedPill
// ------------------------------------------------------------------------------------

export interface SegmentState {
  selected: boolean;
  pressed: boolean;
}

export interface SegmentLook {
  fill: PaletteKey | null;
  label: 'onInk' | 'ink' | 'muted';
}

/**
 * The selected segment is the ink thumb, held or not; an unselected one has no fill and a
 * muted label (gated on the cream track, P1), and while held the pressed fill with ink.
 */
export function segmentLook({ selected, pressed }: SegmentState): SegmentLook {
  if (selected) return { fill: 'ink', label: 'onInk' };
  return pressed ? { fill: 'pressed', label: 'ink' } : { fill: null, label: 'muted' };
}

// ------------------------------------------------------------------------------------
// Soft labels
// ------------------------------------------------------------------------------------

/** The inks a soft label takes: each a palette key gated on its tint (P3, P4). */
export type SoftInk = 'ink' | 'muted' | 'amberInk' | 'aquaInk' | 'danger';

export interface SoftLook {
  fill: PaletteKey | null;
  ink: SoftInk;
  edge: PaletteKey | null;
  /** A dashed edge: a shape, so the state survives greyscale (FR-025). */
  dashed: boolean;
  /** The icon, or `null` where the adapter draws its own mark (the live dot). */
  icon: IconName | null;
}

/**
 * `planning` is amber, `active` cream with a hairline and the coral live dot, `past` cream
 * and muted. Three shapes (a calendar, a dot, a check), not only three hues.
 */
export const STATUS_LOOKS: Record<TripStatus, SoftLook> = {
  planning: {
    fill: 'amberTint',
    ink: 'amberInk',
    edge: null,
    dashed: false,
    icon: 'calendar',
  },
  active: {
    fill: 'surfaceSecondary',
    ink: 'ink',
    edge: 'hairline',
    dashed: false,
    icon: null,
  },
  past: {
    fill: 'surfaceSecondary',
    ink: 'muted',
    edge: null,
    dashed: false,
    icon: 'check-circle',
  },
};

const AMBER_DASHED: Omit<SoftLook, 'icon'> = {
  fill: 'amberTint',
  ink: 'amberInk',
  edge: 'amberLine',
  dashed: true,
};

/** A record not yet saved: dashed and amber; one that failed: dashed and danger. */
export const SYNC_BADGE_LOOKS = {
  pending: { ...AMBER_DASHED, icon: 'clock' },
  syncing: { ...AMBER_DASHED, icon: 'sync' },
  failed: {
    fill: 'dangerTint',
    ink: 'danger',
    edge: 'danger',
    dashed: true,
    icon: 'alert',
  },
} as const satisfies Record<string, SoftLook>;

export const PRIVACY_LOOK: SoftLook = {
  fill: 'aquaTint',
  ink: 'aquaInk',
  edge: null,
  dashed: false,
  icon: 'lock',
};
