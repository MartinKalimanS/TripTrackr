/**
 * T527 - the platform shapes that the Sunrise chrome shares (feature 005, research D5-21,
 * contract C5-21 and C5-22; FR-028): the sheet's handle, 36 by 5 dp on iOS and 32 by 4 dp on
 * Android, and the extended action button, a pill 52 dp tall on iOS and a rounded square of
 * radius 16 and 56 dp on Android. Pure data and two pure choosers, so the Home sheet, the
 * Trips button and every area button read ONE table and never write the numbers again.
 */
import { Radii } from '@/theme';

import { FabShape, SheetHandle, fabShapeOf, sheetHandleOf } from './platform-shapes';

describe('SheetHandle - the grabber (FR-028)', () => {
  test('is 36 by 5 dp on iOS and 32 by 4 dp on Android', () => {
    expect(sheetHandleOf('ios')).toMatchObject({ width: 36, height: 5 });
    expect(sheetHandleOf('android')).toMatchObject({ width: 32, height: 4 });
  });

  test('is a thin capsule: its radius is at least half its height', () => {
    for (const handle of [SheetHandle.ios, SheetHandle.android]) {
      expect(handle.radius).toBeGreaterThanOrEqual(handle.height / 2);
      expect(handle.radius).toBeLessThanOrEqual(handle.width / 2);
    }
  });

  test('sits in a 28 dp zone with a 96 by 48 dp hit area, on both platforms', () => {
    expect(SheetHandle.zone).toBe(28);
    expect(SheetHandle.hitWidth).toBe(96);
    expect(SheetHandle.hitHeight).toBe(48);
    // 48 dp is the Android minimum touch target; iOS needs only 44.
    expect(SheetHandle.hitHeight).toBeGreaterThanOrEqual(48);
  });

  test('any other platform name gets the iOS handle (the app ships on two)', () => {
    expect(sheetHandleOf('web')).toBe(SheetHandle.ios);
  });
});

describe('FabShape - the extended action button (FR-028)', () => {
  test('is a pill 52 dp tall on iOS', () => {
    expect(fabShapeOf('ios')).toEqual({ minHeight: 52, borderRadius: Radii.full });
  });

  test('is a rounded square of radius 16, 56 dp tall, on Android', () => {
    expect(Radii.lg).toBe(16);
    expect(fabShapeOf('android')).toEqual({ minHeight: 56, borderRadius: Radii.lg });
  });

  test('the collapsed (icon only) button is a 56 dp square on both, with the same corner', () => {
    expect(FabShape.mini).toBe(56);
    expect(fabShapeOf('ios', true)).toEqual({
      minHeight: 56,
      minWidth: 56,
      borderRadius: Radii.full,
    });
    expect(fabShapeOf('android', true)).toEqual({
      minHeight: 56,
      minWidth: 56,
      borderRadius: Radii.lg,
    });
  });

  test('both are at least the platform touch target tall', () => {
    expect(fabShapeOf('ios').minHeight).toBeGreaterThanOrEqual(44);
    expect(fabShapeOf('android').minHeight).toBeGreaterThanOrEqual(48);
  });

  test('is a minimum height, never a height: it grows with the text size', () => {
    for (const os of ['ios', 'android']) {
      expect(fabShapeOf(os)).not.toHaveProperty('height');
    }
  });
});
