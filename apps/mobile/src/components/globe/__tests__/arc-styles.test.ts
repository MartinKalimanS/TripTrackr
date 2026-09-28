/**
 * Per-status styling and the beacon's motion — FR-046, research D-30.
 *
 * "Distinguishable at a glance" must not rest on hue alone (feature 002
 * FR-010): planned trips are dashed, past trips thin, active trips thick —
 * and every colour is a globe token the contrast gate has measured.
 */
import { GlobeColors, GlobeGeometry } from '@/constants/theme';
import type { LngLat } from '@/features/globe/great-circle';

import {
  LEG_DURATION_MS,
  arcStyle,
  beaconPosition,
  beaconStyle,
  casingStyle,
  markerStyle,
  statusFilter,
} from '../arc-styles';

const STATUSES = ['past', 'planning', 'active'] as const;

describe.each(['light', 'dark'] as const)('%s palette', (theme) => {
  const palette = GlobeColors[theme];

  test('each status draws in its own globe token', () => {
    for (const status of STATUSES) {
      expect(arcStyle(status, palette).lineColor).toBe(palette[status]);
    }
  });

  test('the casing is the casing token, wide enough to show on both sides of every status', () => {
    const style = casingStyle(palette);
    expect(style.lineColor).toBe(palette.casing);
    expect(style.lineWidth).toEqual([
      'match',
      ['get', 'status'],
      'active',
      GlobeGeometry.arcWidth.active + 2 * GlobeGeometry.casingWidth,
      'planning',
      GlobeGeometry.arcWidth.planning + 2 * GlobeGeometry.casingWidth,
      GlobeGeometry.arcWidth.past + 2 * GlobeGeometry.casingWidth,
    ]);
  });

  test('markers and the beacon take their trip’s status colour over a casing ring', () => {
    const colour = [
      'match',
      ['get', 'status'],
      'active',
      palette.active,
      'planning',
      palette.planning,
      palette.past,
    ];
    expect(markerStyle(palette)).toMatchObject({
      circleColor: colour,
      circleStrokeColor: palette.casing,
    });
    expect(beaconStyle(palette)).toMatchObject({
      circleColor: colour,
      circleStrokeColor: palette.casing,
    });
  });
});

describe('the statuses differ by more than hue (feature 002 FR-010)', () => {
  const palette = GlobeColors.light;

  test('only planned trips are dashed', () => {
    expect(arcStyle('planning', palette).lineDasharray).toEqual(
      GlobeGeometry.planningDash,
    );
    expect(arcStyle('active', palette).lineDasharray).toBeUndefined();
    expect(arcStyle('past', palette).lineDasharray).toBeUndefined();
  });

  test('past is the thinnest line and active the thickest', () => {
    const width = (status: (typeof STATUSES)[number]) =>
      arcStyle(status, palette).lineWidth as number;
    expect(width('past')).toBeLessThan(width('planning'));
    expect(width('planning')).toBeLessThan(width('active'));
  });

  test('the beacon is larger than a marker, so it reads on top of its own arc', () => {
    expect(beaconStyle(palette).circleRadius as number).toBeGreaterThan(
      markerStyle(palette).circleRadius as number,
    );
  });

  test('every layer ignores the basemap’s lighting so it renders the measured token', () => {
    for (const status of STATUSES) {
      expect(arcStyle(status, palette).lineEmissiveStrength).toBe(1);
    }
    expect(casingStyle(palette).lineEmissiveStrength).toBe(1);
    expect(markerStyle(palette).circleEmissiveStrength).toBe(1);
    expect(beaconStyle(palette).circleEmissiveStrength).toBe(1);
  });

  test('a status filter selects that status and nothing else', () => {
    expect(statusFilter('planning')).toEqual(['==', ['get', 'status'], 'planning']);
  });
});

describe('beaconPosition — one leg every LEG_DURATION_MS, eased, looping', () => {
  const route: LngLat[][][] = [
    [
      [
        [0, 0],
        [10, 0],
      ],
    ],
    [
      [
        [10, 0],
        [10, 10],
        [10, 20],
      ],
    ],
  ];

  test('starts at the first stop and is halfway along the leg at half time', () => {
    expect(beaconPosition(route, 0)).toEqual([0, 0]);
    expect(beaconPosition(route, LEG_DURATION_MS / 2)).toEqual([5, 0]);
  });

  test('eases: slower near the stops than a constant speed would be', () => {
    const [lng] = beaconPosition(route, LEG_DURATION_MS / 4)!;
    expect(lng).toBeGreaterThan(0);
    expect(lng).toBeLessThan(2.5);
  });

  test('moves on to the next leg, then loops back to the start', () => {
    expect(beaconPosition(route, LEG_DURATION_MS)).toEqual([10, 0]);
    expect(beaconPosition(route, LEG_DURATION_MS * 1.5)).toEqual([10, 10]);
    expect(beaconPosition(route, LEG_DURATION_MS * 2)).toEqual([0, 0]);
  });

  test('never interpolates across a date-line split — it steps from 180° to −180°', () => {
    const pacific: LngLat[][][] = [
      [
        [
          [170, 0],
          [180, 0],
        ],
        [
          [-180, 0],
          [-170, 0],
        ],
      ],
    ];
    for (let t = 0; t < LEG_DURATION_MS; t += LEG_DURATION_MS / 40) {
      const [lng] = beaconPosition(pacific, t)!;
      expect(Math.abs(lng)).toBeGreaterThanOrEqual(170);
    }
  });

  test('an empty route has no position', () => {
    expect(beaconPosition([], 1000)).toBeNull();
  });
});
