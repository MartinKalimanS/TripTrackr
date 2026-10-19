/**
 * @jest-environment node
 *
 * The idle spin of the Home globe, as a rule (feature 005, T537; FR-019; research D5-04;
 * contract C5-24): "while Home is idle at world scale the globe turns slowly; it stops at the
 * first touch, when the sheet is above half, when Home is not visible, when the app is in the
 * background, after 45 seconds, and always under reduced motion". The brief adds one more: a
 * live trip's callout is showing (its card is placed once the camera is still, so a camera that
 * never stops would leave it where it was).
 *
 * Pure: each stop condition is one test, and the move is the contract's `linearTo`, 5 s per 20
 * degrees. What a timer does with them is `use-idle-spin.test.tsx`.
 */
import {
  IDLE_SPIN_MOVES,
  IdleSpin,
  idleSpinAllowed,
  nextSpinCentre,
  spinCamera,
  type IdleSpinConditions,
} from '@/features/globe/idle-spin';

/** Home idle at world scale: nothing stops it. */
const IDLE: IdleSpinConditions = {
  mounted: true,
  touched: false,
  detent: 'half',
  prefersLessMotion: false,
  foreground: true,
  focused: true,
  calloutShowing: false,
};

describe('idleSpinAllowed: every stop condition of FR-019', () => {
  test('spins while Home is idle', () => {
    expect(idleSpinAllowed(IDLE)).toBe(true);
  });

  test.each(['peek', 'half'] as const)('spins with the sheet at %s', (detent) => {
    expect(idleSpinAllowed({ ...IDLE, detent })).toBe(true);
  });

  test('stops at the first touch', () => {
    expect(idleSpinAllowed({ ...IDLE, touched: true })).toBe(false);
  });

  test('stops when the sheet is above half (the Countries list covers the globe)', () => {
    expect(idleSpinAllowed({ ...IDLE, detent: 'full' })).toBe(false);
  });

  test('stops under reduced motion, always', () => {
    expect(idleSpinAllowed({ ...IDLE, prefersLessMotion: true })).toBe(false);
  });

  test('stops while the app is in the background', () => {
    expect(idleSpinAllowed({ ...IDLE, foreground: false })).toBe(false);
  });

  test('stops while Home is not the visible screen', () => {
    expect(idleSpinAllowed({ ...IDLE, focused: false })).toBe(false);
  });

  test('stops while a live trip callout is showing', () => {
    expect(idleSpinAllowed({ ...IDLE, calloutShowing: true })).toBe(false);
  });

  test('has nothing to turn before the globe is drawn (loading, or no map)', () => {
    expect(idleSpinAllowed({ ...IDLE, mounted: false })).toBe(false);
  });

  test('has no condition about the network: being offline never stops the globe', () => {
    // The conditions are the whole input: there is no network field to set.
    expect(Object.keys(IDLE).sort()).toEqual([
      'calloutShowing',
      'detent',
      'focused',
      'foreground',
      'mounted',
      'prefersLessMotion',
      'touched',
    ]);
  });
});

describe('the move: a linearTo chain, 5 seconds per 20 degrees', () => {
  test('is the contract of C5-24', () => {
    expect(IdleSpin.stepMs).toBe(5000);
    expect(IdleSpin.stepDegrees).toBe(20);
    expect(IdleSpin.capMs).toBe(45_000);
  });

  test('allows the moves that END within the 45 seconds', () => {
    // Moves start at 5 s, 10 s ... 40 s and the last one finishes at 45 s.
    expect(IDLE_SPIN_MOVES).toBe(8);
  });

  test('turns east by one step and keeps the latitude', () => {
    expect(nextSpinCentre([10, 48])).toEqual([30, 48]);
  });

  test('wraps at the date line', () => {
    expect(nextSpinCentre([170, 10])).toEqual([-170, 10]);
    expect(nextSpinCentre([160, 10])[0]).toBe(180);
  });

  test('is a native linear move over one step, to the centre it was given', () => {
    expect(spinCamera([30, 48])).toEqual({
      centerCoordinate: [30, 48],
      animationMode: 'linearTo',
      animationDuration: 5000,
    });
  });
});
