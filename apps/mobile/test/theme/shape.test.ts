/**
 * T413 — contract C4-6, data-model §3, plus `deepFreeze`.
 *
 * `AtlasRadius` and `AtlasSpacing` are NEW names: the existing `Radius` (8, 16, 24, pill)
 * and `Spacing` in `constants/theme.ts` stay until phase 7 so no unmigrated screen moves
 * by a pixel. Atlas radii are 8, 12, 16, 24 and the capsule.
 */
import { Radius, Spacing } from '@/constants/theme';
import { deepFreeze } from '@/theme/freeze';
import {
  AtlasRadius,
  AtlasSpacing,
  cornerStyle,
  type AtlasRadiusName,
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
