/**
 * T413 — contract C4-6, FR-022, FR-028, research D4-05.
 *
 * Motion is budgeted, not decorative: press 100 ms or less, in-place transitions 200 ms or
 * less, list entrance about 150 ms, movement and fade only, no bounce. Under reduced
 * motion every duration is zero while the destination state is still shown.
 */
import {
  Motion,
  MotionProperties,
  isMotionProperty,
  motionDuration,
  type MotionName,
} from '@/theme/motion';

describe('Motion — contract C4-6', () => {
  test('holds the three timings of the contract', () => {
    expect(Motion).toEqual({ pressMs: 100, transitionMs: 200, listEntranceMs: 150 });
  });

  test('a press takes 100 ms or less', () => {
    expect(Motion.pressMs).toBeLessThanOrEqual(100);
  });

  test('every in-place transition completes within 200 ms (FR-022)', () => {
    for (const name of Object.keys(Motion) as MotionName[]) {
      expect(Motion[name]).toBeLessThanOrEqual(200);
    }
  });

  test('the list entrance sits between a press and a transition', () => {
    expect(Motion.listEntranceMs).toBeGreaterThan(Motion.pressMs);
    expect(Motion.listEntranceMs).toBeLessThan(Motion.transitionMs);
  });

  test('is deeply frozen', () => {
    expect(Object.isFrozen(Motion)).toBe(true);
    const before = Motion.pressMs;
    try {
      (Motion as { pressMs: number }).pressMs = 900;
    } catch {
      // Strict mode throws a TypeError; sloppy mode ignores the write. Either is fine.
    }
    expect(Motion.pressMs).toBe(before);
  });
});

describe('motionDuration', () => {
  test.each(Object.keys(Motion) as MotionName[])(
    'returns the %s timing normally',
    (name) => {
      expect(motionDuration(name, false)).toBe(Motion[name]);
    },
  );

  test.each(Object.keys(Motion) as MotionName[])(
    'returns 0 for %s under reduced motion, so the destination shows at once (FR-028)',
    (name) => {
      expect(motionDuration(name, true)).toBe(0);
    },
  );
});

describe('MotionProperties — movement and fade only (FR-022)', () => {
  test('lists transform and opacity, nothing else', () => {
    expect([...MotionProperties]).toEqual(['transform', 'opacity']);
  });

  test('isMotionProperty accepts the two and rejects layout-affecting properties', () => {
    expect(isMotionProperty('transform')).toBe(true);
    expect(isMotionProperty('opacity')).toBe(true);
    for (const property of ['width', 'height', 'top', 'margin', 'backgroundColor']) {
      expect(isMotionProperty(property)).toBe(false);
    }
  });

  test('is frozen', () => {
    expect(Object.isFrozen(MotionProperties)).toBe(true);
  });
});
