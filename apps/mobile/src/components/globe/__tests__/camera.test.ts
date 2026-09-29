/**
 * The tilt that follows the traveller in — T104 (FR-048, FR-049).
 *
 * Flat on the globe and at country scale; rising through city scale so that
 * terrain and the basemap's buildings read as relief at street level. The app
 * only ever adjusts a tilt it set itself.
 */
import { GlobePitch } from '@/constants/theme';

import { nextPitch, pitchForZoom } from '../camera';

describe('pitchForZoom', () => {
  test('keeps the globe and country scale flat', () => {
    expect(pitchForZoom(1.4)).toBe(0);
    expect(pitchForZoom(GlobePitch.startZoom)).toBe(0);
  });

  test('reaches the full tilt at street level and never exceeds it', () => {
    expect(pitchForZoom(GlobePitch.fullZoom)).toBe(GlobePitch.max);
    expect(pitchForZoom(22)).toBe(GlobePitch.max);
  });

  test('rises steadily in between', () => {
    const middle = (GlobePitch.startZoom + GlobePitch.fullZoom) / 2;
    expect(pitchForZoom(middle)).toBeCloseTo(GlobePitch.max / 2);

    const samples = [11, 12, 13, 14, 15, 16, 17].map(pitchForZoom);
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
  });
});

describe('nextPitch — once the traveller stops moving the map', () => {
  const street = GlobePitch.fullZoom;

  test('tilts the camera as they arrive at street level', () => {
    expect(nextPitch({ zoom: street, pitch: 0 }, 0)).toBe(GlobePitch.max);
  });

  test('follows them back out, flat again above city scale', () => {
    expect(
      nextPitch(
        { zoom: GlobePitch.startZoom - 1, pitch: GlobePitch.max },
        GlobePitch.max,
      ),
    ).toBe(0);
  });

  test('does nothing when the tilt already matches', () => {
    expect(nextPitch({ zoom: street, pitch: GlobePitch.max }, GlobePitch.max)).toBeNull();
    expect(nextPitch({ zoom: 3, pitch: 0 }, 0)).toBeNull();
  });

  test('leaves a tilt the traveller chose by hand alone', () => {
    expect(nextPitch({ zoom: street, pitch: 20 }, 0)).toBeNull();
    expect(nextPitch({ zoom: 10, pitch: 35 }, GlobePitch.max)).toBeNull();
  });

  test('but flattens the camera once they are back out at the globe', () => {
    expect(nextPitch({ zoom: GlobePitch.flattenBelowZoom - 1, pitch: 35 }, 0)).toBe(0);
  });
});
