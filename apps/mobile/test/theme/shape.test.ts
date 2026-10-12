/**
 * T413 — contract C4-6, data-model §3, plus `deepFreeze`.
 *
 * `AtlasRadius` and `AtlasSpacing` are NEW names: the existing `Radius` (8, 16, 24, pill)
 * and `Spacing` in `constants/theme.ts` stay until phase 7 so no unmigrated screen moves
 * by a pixel. Atlas radii are 8, 12, 16, 24 and the capsule.
 */
import { Radius, Spacing } from '@/constants/theme';
import { deepFreeze } from '@/theme/freeze';
import { PaletteNames, Palettes } from '@/theme/palette';
import {
  AtlasRadius,
  AtlasSpacing,
  FocusRing,
  IconSize,
  IconWeights,
  Lift,
  LiftElevation,
  Radii,
  ScreenMargin,
  Space,
  cornerOf,
  cornerStyle,
  innerRadius,
  liftOf,
  type AtlasRadiusName,
  type RadiiName,
} from '@/theme/shape';

describe('AtlasRadius — contract C4-6', () => {
  test('holds sm 8, md 12, lg 16, xl 24 and the capsule', () => {
    expect(AtlasRadius).toEqual({ sm: 8, md: 12, lg: 16, xl: 24, pill: 999 });
  });

  test('grows from step to step', () => {
    const values = Object.values(AtlasRadius);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  test('does not clash with the legacy Radius, which keeps its own values', () => {
    expect(AtlasRadius).not.toBe(Radius);
    expect(Radius).toEqual({ sm: 8, md: 16, lg: 24, pill: 999 });
  });

  test('is deeply frozen', () => {
    expect(Object.isFrozen(AtlasRadius)).toBe(true);
    const before = AtlasRadius.md;
    try {
      (AtlasRadius as { md: number }).md = 40;
    } catch {
      // Strict mode throws a TypeError; sloppy mode ignores the write. Either is fine.
    }
    expect(AtlasRadius.md).toBe(before);
  });
});

describe('cornerStyle', () => {
  test.each(['sm', 'md', 'lg', 'xl'] as AtlasRadiusName[])(
    '%s uses the continuous corner curve',
    (name) => {
      expect(cornerStyle(name)).toEqual({
        borderRadius: AtlasRadius[name],
        borderCurve: 'continuous',
      });
    },
  );

  test('the capsule is circular, never continuous', () => {
    expect(cornerStyle('pill')).toEqual({ borderRadius: 999 });
  });
});

describe('AtlasSpacing — contract C4-6', () => {
  test('keeps every legacy step at the same value', () => {
    for (const [name, value] of Object.entries(Spacing)) {
      expect((AtlasSpacing as Record<string, number>)[name]).toBe(value);
    }
  });

  test('adds 12 and 48', () => {
    expect(AtlasSpacing.twelve).toBe(12);
    expect(AtlasSpacing.fortyEight).toBe(48);
  });

  test('is the legacy table plus exactly those two steps, in ascending order', () => {
    expect(Object.values(AtlasSpacing)).toEqual([2, 4, 8, 12, 16, 24, 32, 48, 64]);
    expect(Object.keys(AtlasSpacing)).toHaveLength(Object.keys(Spacing).length + 2);
  });

  test('is deeply frozen', () => {
    expect(Object.isFrozen(AtlasSpacing)).toBe(true);
  });
});

describe('FocusRing — contracts C4-3 and C5-4 P13', () => {
  test('is a 2.5 dp ring drawn 2 dp off the control', () => {
    expect(FocusRing).toEqual({ width: 2.5, offset: 2 });
  });

  test('keeps a gap, so the ring never touches an accent fill', () => {
    // The gate measures the ring against canvas, surface and field fill only; that is
    // sound only while the gap of surrounding neutral exists.
    expect(FocusRing.offset).toBeGreaterThan(0);
    expect(FocusRing.width).toBeGreaterThan(0);
  });

  test('the ring is at least as thick as a hairline boundary', () => {
    expect(FocusRing.width).toBeGreaterThanOrEqual(2.5);
  });

  test('is deeply frozen', () => {
    expect(Object.isFrozen(FocusRing)).toBe(true);
    const before = FocusRing.offset;
    try {
      (FocusRing as { offset: number }).offset = 0;
    } catch {
      // Strict mode throws a TypeError; sloppy mode ignores the write. Either is fine.
    }
    expect(FocusRing.offset).toBe(before);
  });
});

describe('deepFreeze', () => {
  test('freezes nested objects and arrays', () => {
    const frozen = deepFreeze({ a: { b: [1, { c: 2 }] } });
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.a)).toBe(true);
    expect(Object.isFrozen(frozen.a.b)).toBe(true);
    expect(Object.isFrozen(frozen.a.b[1])).toBe(true);
  });

  test('returns the same object it was given', () => {
    const value = { x: 1 };
    expect(deepFreeze(value)).toBe(value);
  });

  test('leaves primitives and an already frozen value alone', () => {
    expect(deepFreeze(5)).toBe(5);
    expect(deepFreeze('x')).toBe('x');
    const once = Object.freeze({ k: Object.freeze({ v: 1 }) });
    expect(deepFreeze(once)).toBe(once);
  });
});

/**
 * T516 — feature 005, contract C5-8, data-model section 3.
 *
 * Sunrise space, radius, lift and icon sizes are NEW names beside the 004 `AtlasRadius` and
 * `AtlasSpacing` above, which keep their values until Phase 10: the 004 steps are ordinals
 * and the 004 radii have a `pill` where Sunrise has a `full` and a 28 dp sheet.
 */
describe('Space — contract C5-8', () => {
  test('is the 4 dp grid: 4, 8, 12, 16, 20, 24, 32, 40 under the data-model keys', () => {
    expect(Space).toEqual({ 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 });
  });

  test('grows from step to step and is deeply frozen', () => {
    const values = Object.values(Space);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(Object.isFrozen(Space)).toBe(true);
  });

  test('the screen margin is 20, and 16 on an Android list', () => {
    expect(ScreenMargin).toEqual({ default: 20, androidList: 16 });
    expect(ScreenMargin.default).toBe(Space[5]);
    expect(ScreenMargin.androidList).toBe(Space[4]);
  });
});

describe('Radii — contract C5-8', () => {
  test('holds 8, 12 (inputs), 16 (thumbnails, tiles), 24 (cards), 28 (sheets) and full', () => {
    expect(Radii).toEqual({ sm: 8, md: 12, lg: 16, xl: 24, sheet: 28, full: 999 });
  });

  test('grows from step to step and is deeply frozen', () => {
    const values = Object.values(Radii);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(Object.isFrozen(Radii)).toBe(true);
  });

  test('the 004 radii are unchanged, so no unmigrated screen moves by a pixel', () => {
    expect(AtlasRadius).toEqual({ sm: 8, md: 12, lg: 16, xl: 24, pill: 999 });
  });

  test.each(['sm', 'md', 'lg', 'xl', 'sheet'] as RadiiName[])(
    '%s uses the continuous corner curve',
    (name) => {
      expect(cornerOf(name)).toEqual({
        borderRadius: Radii[name],
        borderCurve: 'continuous',
      });
    },
  );

  test('full is circular, never continuous', () => {
    expect(cornerOf('full')).toEqual({ borderRadius: 999 });
  });

  test.each([
    [24, 16, 8],
    [24, 8, 16],
    [24, 0, 24],
    [12, 8, 8],
    [28, 24, 8],
  ])(
    'an inner radius is outer %s minus padding %s, never below 8: %s',
    (outer, pad, inner) => {
      expect(innerRadius(outer, pad)).toBe(inner);
    },
  );
});

describe('Lift — contract C5-8', () => {
  const LIGHT = {
    lift1: [
      {
        offsetX: 0,
        offsetY: 1,
        blurRadius: 2,
        spreadDistance: 0,
        color: 'rgba(14, 42, 71, 0.06)',
      },
      {
        offsetX: 0,
        offsetY: 8,
        blurRadius: 24,
        spreadDistance: -8,
        color: 'rgba(14, 42, 71, 0.14)',
      },
    ],
    lift2: [
      {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 6,
        spreadDistance: 0,
        color: 'rgba(14, 42, 71, 0.1)',
      },
      {
        offsetX: 0,
        offsetY: 16,
        blurRadius: 32,
        spreadDistance: -8,
        color: 'rgba(14, 42, 71, 0.28)',
      },
    ],
  };
  const DARK = {
    lift1: [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 0,
        spreadDistance: 1,
        color: 'rgba(255, 255, 255, 0.1)',
      },
      {
        offsetX: 0,
        offsetY: 8,
        blurRadius: 24,
        spreadDistance: -8,
        color: 'rgba(0, 0, 0, 0.5)',
      },
    ],
    lift2: [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 0,
        spreadDistance: 1,
        color: 'rgba(255, 255, 255, 0.1)',
      },
      {
        offsetX: 0,
        offsetY: 2,
        blurRadius: 6,
        spreadDistance: 0,
        color: 'rgba(0, 0, 0, 0.35)',
      },
      {
        offsetX: 0,
        offsetY: 16,
        blurRadius: 32,
        spreadDistance: -8,
        color: 'rgba(0, 0, 0, 0.6)',
      },
    ],
  };

  test.each(['light', 'light-contrast'] as const)(
    '%s holds the navy lifts of the contract',
    (name) => {
      expect(Lift[name]).toEqual(LIGHT);
    },
  );

  test.each(['dark', 'dark-contrast'] as const)(
    '%s holds a hairline ring and a tonal lift, as the contract draws them',
    (name) => {
      expect(Lift[name]).toEqual(DARK);
    },
  );

  test.each(PaletteNames)('%s has exactly two lifts: no other shadow exists', (name) => {
    expect(Object.keys(Lift[name])).toEqual(['lift1', 'lift2']);
  });

  test('the light lifts are tinted with the ink, never a literal black', () => {
    const [r, g, b] = [1, 3, 5].map((i) =>
      parseInt(Palettes.light.ink.slice(i, i + 2), 16),
    );
    for (const layer of [...Lift.light.lift1, ...Lift.light.lift2]) {
      expect(layer.color).toContain(`rgba(${r}, ${g}, ${b},`);
    }
  });

  test('a lift is a softer step than the one above it: lift2 casts more than lift1', () => {
    for (const name of PaletteNames) {
      const reach = (layers: readonly { offsetY: number; blurRadius: number }[]) =>
        Math.max(...layers.map((layer) => layer.offsetY + layer.blurRadius));
      expect(reach(Lift[name].lift2)).toBeGreaterThan(reach(Lift[name].lift1));
    }
  });

  test('is deeply frozen, and liftOf hands out a copy a caller may extend', () => {
    expect(Object.isFrozen(Lift)).toBe(true);
    expect(Object.isFrozen(Lift.light.lift1)).toBe(true);
    const copy = liftOf('light', 'lift1');
    expect(copy).toEqual(Lift.light.lift1);
    expect(copy).not.toBe(Lift.light.lift1);
    expect(copy[0]).not.toBe(Lift.light.lift1[0]);
  });

  test('below Android 9 an outset shadow is an elevation: two steps, lift2 above lift1', () => {
    expect(LiftElevation).toEqual({ lift1: 2, lift2: 6 });
    expect(LiftElevation.lift2).toBeGreaterThan(LiftElevation.lift1);
  });
});

describe('IconSize — contract C5-8', () => {
  test('holds 16, 20 and 24', () => {
    expect(IconSize).toEqual({ sm: 16, md: 20, lg: 24 });
    expect(Object.isFrozen(IconSize)).toBe(true);
  });

  test('has three weights: regular at rest, fill for selected and status, duotone for stat tiles', () => {
    expect([...IconWeights]).toEqual(['regular', 'fill', 'duotone']);
    expect(Object.isFrozen(IconWeights)).toBe(true);
  });
});
