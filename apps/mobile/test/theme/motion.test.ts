/**
 * T413 — contract C4-6, FR-022, FR-028, research D4-05.
 *
 * Motion is budgeted, not decorative: press 100 ms or less, in-place transitions 200 ms or
 * less, list entrance about 150 ms, movement and fade only, no bounce. Under reduced
 * motion every duration is zero while the destination state is still shown.
 */
import {
  Motion,
  MotionDurationNames,
  MotionProperties,
  isMotionProperty,
  motionDuration,
  pressScaleOf,
  springOf,
  type MotionName,
  type Spring,
} from '@/theme/motion';

/** A spring of unit mass: its damping ratio c / (2 sqrt(k)). */
const dampingRatio = ({ stiffness, damping }: Spring) =>
  damping / (2 * Math.sqrt(stiffness));

/** The 2 percent settling time of an under-damped spring of unit mass, in ms. */
const settleMs = (spring: Spring) =>
  (4 / (dampingRatio(spring) * Math.sqrt(spring.stiffness))) * 1000;

describe('Motion — contract C4-6', () => {
  test('holds the three timings of the 004 contract', () => {
    expect(Motion).toMatchObject({
      pressMs: 100,
      transitionMs: 200,
      listEntranceMs: 150,
    });
  });

  test('a press takes 100 ms or less', () => {
    expect(Motion.pressMs).toBeLessThanOrEqual(100);
  });

  test('every in-place transition completes within 200 ms (FR-022)', () => {
    for (const name of ['pressMs', 'transitionMs', 'listEntranceMs'] as const) {
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
  test.each([...MotionDurationNames])('returns the %s timing normally', (name) => {
    expect(motionDuration(name, false)).toBe(Motion[name]);
  });

  test.each([...MotionDurationNames])(
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

/**
 * T516 — feature 005, contract C5-9, data-model section 3.
 *
 * The Sunrise timings extend `Motion` (the 004 keys keep their names and values) and each
 * has a reduced-motion twin: a duration becomes 0, a press scale becomes 1, a spring becomes
 * a jump. A spring is checked against the physics: its damping ratio and the time it takes to
 * settle, not just the two numbers.
 */
describe('Motion — contract C5-9', () => {
  test('a press is the pressed fill at scale .97 in 100 ms', () => {
    expect(Motion.pressMs).toBe(100);
    expect(Motion.pressScale).toBe(0.97);
  });

  test('the sheet and pill selection spring is stiffness 700, damping 47.6 (ratio .9)', () => {
    expect(Motion.sheetSpring).toMatchObject({ stiffness: 700, damping: 47.6 });
    expect(dampingRatio(Motion.sheetSpring)).toBeCloseTo(0.9, 2);
  });

  test('the sheet spring settles within 300 ms', () => {
    expect(settleMs(Motion.sheetSpring)).toBeLessThanOrEqual(300);
  });

  test('the pin pop is stiffness 800, damping 33.9 (ratio .6), staggered by 40 ms', () => {
    expect(Motion.pinSpring).toMatchObject({ stiffness: 800, damping: 33.9 });
    expect(dampingRatio(Motion.pinSpring)).toBeCloseTo(0.6, 2);
    expect(Motion.pinStaggerMs).toBe(40);
  });

  test('the camera follows in 280 ms, once per settle', () => {
    expect(Motion.cameraFollowMs).toBe(280);
  });

  test('the count-up is 700 ms with an 80 ms stagger', () => {
    expect(Motion.countUpMs).toBe(700);
    expect(Motion.countUpStaggerMs).toBe(80);
  });

  test('a stamp lands in 180 to 220 ms, from scale 1.6 and -14 degrees, settling 2 dp', () => {
    expect(Motion.stampLandMs).toBe(200);
    expect(Motion.stampLandRangeMs).toEqual([180, 220]);
    expect(Motion.stampLandMs).toBeGreaterThanOrEqual(Motion.stampLandRangeMs[0]);
    expect(Motion.stampLandMs).toBeLessThanOrEqual(Motion.stampLandRangeMs[1]);
    expect(Motion.stampScaleFrom).toBe(1.6);
    expect(Motion.stampRotateFromDeg).toBe(-14);
    expect(Motion.stampSettleDp).toBe(2);
  });

  test('the live pulse is 2.4 s, scale 1 to 1.7, opacity .6 to 0', () => {
    expect(Motion.pulseMs).toBe(2400);
    expect(Motion.pulseScaleTo).toBe(1.7);
    expect(Motion.pulseOpacityFrom).toBe(0.6);
  });

  test('the skeleton shimmer is 1.4 s', () => {
    expect(Motion.shimmerMs).toBe(1400);
  });

  test('the idle rotation is 5 s per 20 degrees, capped at 45 s, resuming after 7 s idle', () => {
    expect(Motion.spinStepMs).toBe(5000);
    expect(Motion.spinStepDeg).toBe(20);
    expect(Motion.spinCapMs).toBe(45_000);
    expect(Motion.spinResumeMs).toBe(7000);
  });

  test('an in-place change is at most 200 ms', () => {
    expect(Motion.transitionMs).toBeLessThanOrEqual(200);
  });

  test('the 004 keys keep their values', () => {
    expect(Motion).toMatchObject({
      pressMs: 100,
      transitionMs: 200,
      listEntranceMs: 150,
    });
  });
});

describe('reduced motion — the twin of every row of C5-9', () => {
  test('every duration is zero: the destination state is shown at once', () => {
    for (const name of MotionDurationNames) {
      expect({ name, ms: motionDuration(name, true) }).toEqual({ name, ms: 0 });
      expect(motionDuration(name, false)).toBe(Motion[name]);
    }
  });

  test('the duration names are the keys that end in Ms, and only those', () => {
    const expected = Object.keys(Motion).filter(
      (key) => key.endsWith('Ms') && typeof Motion[key as MotionName] === 'number',
    );
    expect([...MotionDurationNames].sort()).toEqual(expected.sort());
  });

  test('a press keeps its fill and loses its scale', () => {
    expect(pressScaleOf(false)).toBe(0.97);
    expect(pressScaleOf(true)).toBe(1);
  });

  test.each(['sheetSpring', 'pinSpring'] as const)(
    '%s is a jump to the destination',
    (name) => {
      expect(springOf(name, false)).toEqual(Motion[name]);
      expect(springOf(name, true)).toBeNull();
    },
  );

  test('a spring is handed out as a copy a caller may extend', () => {
    expect(springOf('sheetSpring', false)).not.toBe(Motion.sheetSpring);
  });
});
