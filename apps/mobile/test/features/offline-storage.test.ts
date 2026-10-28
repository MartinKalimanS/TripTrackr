/**
 * `features/trips/offline-storage` - the storage caption of the offline maps screen
 * (tasks.md T444; 004 FR-015, FR-025). A pure sum over states the screen already shows:
 * it reads no pack, asks Mapbox nothing and changes nothing about what is saved.
 */
import type { OfflinePackState } from '@/features/trips/offline-packs';
import { storageCaption, storageFigures } from '@/features/trips/offline-storage';

const ready = (bytes: number): OfflinePackState => ({ kind: 'ready', bytes });
const NONE: OfflinePackState = { kind: 'none' };
const DOWNLOADING: OfflinePackState = { kind: 'downloading', percent: 40 };
const FAILED: OfflinePackState = { kind: 'error', message: 'Try again.', partial: true };

describe('storageCaption - what this trip’s saved maps take on the device', () => {
  test('sums the finished maps, in the device’s decimal units', () => {
    expect(storageCaption([ready(12_400_000), ready(8_100_000)], 'en-GB')).toEqual({
      text: 'Maps for this trip’s cities use 20.5 MB on this device.',
      spoken: 'Maps for this trip’s cities use 20.5 megabytes on this device.',
    });
  });

  test('says one megabyte in the singular when read aloud', () => {
    expect(storageCaption([ready(1_000_000)], 'en-GB').spoken).toBe(
      'Maps for this trip’s cities use 1 megabyte on this device.',
    );
  });

  test('follows the device language for the figure', () => {
    expect(storageCaption([ready(12_400_000)], 'de-DE').text).toContain('12,4 MB');
  });

  test('uses the device locale when none is given', () => {
    expect(storageCaption([ready(12_400_000)]).text).toContain('12.4 MB');
  });

  test('counts only what is finished: a download in progress, a failed one and a city not saved have no known size', () => {
    expect(
      storageCaption([ready(5_000_000), DOWNLOADING, FAILED, NONE], 'en-GB').text,
    ).toBe('Maps for this trip’s cities use 5 MB on this device.');
  });

  test('says so, in words, when none of the trip’s cities is saved yet', () => {
    const none = 'None of this trip’s cities are saved on this device yet.';
    expect(storageCaption([NONE, DOWNLOADING, FAILED], 'en-GB')).toEqual({
      text: none,
      spoken: none,
    });
  });

  test('says the same when the trip has no city that can be placed', () => {
    expect(storageCaption([], 'en-GB').text).toBe(
      'None of this trip’s cities are saved on this device yet.',
    );
  });

  test('a finished map of zero bytes is still a saved map', () => {
    expect(storageCaption([ready(0)], 'en-GB').text).toBe(
      'Maps for this trip’s cities use 0 KB on this device.',
    );
  });
});

describe('storageFigures - the storage card’s numbers (F11, UI-SPEC 9.2)', () => {
  test('sums the finished maps and reads the free space, each as words for the eye and the ear', () => {
    const figures = storageFigures([ready(412_000_000), NONE], 1_700_000_000, 'en-GB');
    expect(figures.saved).toBe(true);
    expect(figures.mapsBytes).toBe(412_000_000);
    expect(figures.maps).toEqual({ text: '412 MB', spoken: '412 megabytes' });
    expect(figures.free).toEqual({ text: '1.7 GB', spoken: '1.7 gigabytes' });
  });

  test('draws no free figure and no bar when the device cannot say how much is free', () => {
    for (const unknown of [null, 0, -5, Number.NaN]) {
      const figures = storageFigures([ready(5_000_000)], unknown, 'en-GB');
      expect(figures.free).toBeNull();
      expect(figures.bar).toBeNull();
    }
  });

  test('the bar is the share of the maps and of the free space, in the order Maps then Free', () => {
    const figures = storageFigures([ready(100_000_000)], 300_000_000, 'en-GB');
    expect(figures.bar).toEqual({ maps: 0.25, free: 0.75 });
  });

  test('a map too small to see keeps a sliver so the legend is not a lie, never more than the whole', () => {
    const tiny = storageFigures([ready(1_000)], 64_000_000_000, 'en-GB');
    expect(tiny.bar?.maps).toBe(0.02);
    expect((tiny.bar?.maps ?? 0) + (tiny.bar?.free ?? 0)).toBeCloseTo(1, 10);
    const none = storageFigures([NONE, DOWNLOADING], 64_000_000_000, 'en-GB');
    expect(none.saved).toBe(false);
    expect(none.bar).toEqual({ maps: 0, free: 1 });
  });

  test('counts only finished maps, as the caption does', () => {
    const figures = storageFigures(
      [DOWNLOADING, FAILED, ready(2_000_000)],
      null,
      'en-GB',
    );
    expect(figures.mapsBytes).toBe(2_000_000);
  });

  test('uses the device locale when none is given', () => {
    expect(storageFigures([ready(12_400_000)], null).maps.text).toBe('12.4 MB');
  });
});
