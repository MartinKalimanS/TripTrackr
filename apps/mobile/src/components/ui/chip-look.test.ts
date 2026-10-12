/**
 * T520 - the look of the chip family as data (feature 005; contract C5-16; FR-025, FR-055,
 * FR-063, FR-065, FR-069, FR-070; design-tokens C5-4 P3, P4, P6, P14, P18).
 *
 * Like `buttonLook`, each function answers WHICH PALETTE KEYS paint, so a rule such as
 * "only ink text on a pressed fill" is a property of a table. `test/theme/chip-contrast.test.ts`
 * measures every look in all four themes.
 */
import {
  PRIVACY_LOOK,
  STATUS_LOOKS,
  SYNC_BADGE_LOOKS,
  chipLook,
  segmentLook,
} from './chip-look';

const REST = { selected: false, dashed: false, pressed: false };

describe('chipLook - C5-16 "Chip"', () => {
  test('unselected: cream with a hairline and an ink label', () => {
    expect(chipLook(REST)).toEqual({
      fill: 'surfaceSecondary',
      label: 'ink',
      edge: 'hairline',
      edgeWidth: 1,
      dashed: false,
    });
  });

  test('selected: an ink fill, an onInk label (and a check, drawn by the adapter)', () => {
    expect(chipLook({ ...REST, selected: true })).toEqual({
      fill: 'ink',
      label: 'onInk',
      edge: 'ink',
      edgeWidth: 1,
      dashed: false,
    });
  });

  test('dashed ("add"): no fill, a 1.5 dp dashed border, an ink label', () => {
    expect(chipLook({ ...REST, dashed: true })).toEqual({
      fill: null,
      label: 'ink',
      edge: 'border',
      edgeWidth: 1.5,
      dashed: true,
    });
  });

  test.each([
    ['unselected', REST],
    ['selected', { ...REST, selected: true }],
    ['dashed', { ...REST, dashed: true }],
  ])(
    '%s pressed: the pressed fill and an ink label, never onInk or muted',
    (_name, state) => {
      const look = chipLook({ ...state, pressed: true });
      expect(look.fill).toBe('pressed');
      expect(look.label).toBe('ink');
    },
  );

  test('a press keeps the width and the dash of the edge, so it moves no pixel', () => {
    for (const state of [REST, { ...REST, selected: true }, { ...REST, dashed: true }]) {
      const rest = chipLook(state);
      const held = chipLook({ ...state, pressed: true });
      expect(held.edgeWidth).toBe(rest.edgeWidth);
      expect(held.dashed).toBe(rest.dashed);
    }
  });
});

describe('segmentLook - C5-16 "SegmentedPill"', () => {
  test('selected: the ink thumb and an onInk label, pressed or not', () => {
    for (const pressed of [false, true]) {
      expect(segmentLook({ selected: true, pressed })).toEqual({
        fill: 'ink',
        label: 'onInk',
      });
    }
  });

  test('unselected: no fill and a muted label, which turns to ink on the pressed fill', () => {
    expect(segmentLook({ selected: false, pressed: false })).toEqual({
      fill: null,
      label: 'muted',
    });
    expect(segmentLook({ selected: false, pressed: true })).toEqual({
      fill: 'pressed',
      label: 'ink',
    });
  });
});

describe('the soft labels - C5-16', () => {
  test('StatusChip: planning is amber, active is cream with the live dot, past is cream and muted', () => {
    expect(STATUS_LOOKS.planning).toMatchObject({
      fill: 'amberTint',
      ink: 'amberInk',
      edge: null,
      icon: 'calendar',
    });
    expect(STATUS_LOOKS.active).toMatchObject({
      fill: 'surfaceSecondary',
      ink: 'ink',
      edge: 'hairline',
      icon: null,
    });
    expect(STATUS_LOOKS.past).toMatchObject({
      fill: 'surfaceSecondary',
      ink: 'muted',
      edge: null,
      icon: 'check-circle',
    });
  });

  test('StatusChip: each status has its own shape (icon, dot, icon), not only its own hue', () => {
    const shapes = [STATUS_LOOKS.planning, STATUS_LOOKS.active, STATUS_LOOKS.past].map(
      (look) => look.icon ?? 'dot',
    );
    expect(new Set(shapes).size).toBe(3);
  });

  test('SyncBadge: pending and syncing are amber and dashed, failed is danger and dashed', () => {
    for (const state of ['pending', 'syncing'] as const) {
      expect(SYNC_BADGE_LOOKS[state]).toMatchObject({
        fill: 'amberTint',
        ink: 'amberInk',
        edge: 'amberLine',
        dashed: true,
      });
    }
    expect(SYNC_BADGE_LOOKS.failed).toMatchObject({
      fill: 'dangerTint',
      ink: 'danger',
      edge: 'danger',
      dashed: true,
    });
  });

  test('SyncBadge: each state has its own icon', () => {
    const icons = (['pending', 'syncing', 'failed'] as const).map(
      (state) => SYNC_BADGE_LOOKS[state].icon,
    );
    expect(icons).toEqual(['clock', 'sync', 'alert']);
  });

  test('PrivacyChip: the lock, aquaTint and aquaInk', () => {
    expect(PRIVACY_LOOK).toMatchObject({
      fill: 'aquaTint',
      ink: 'aquaInk',
      edge: null,
      icon: 'lock',
    });
  });
});
