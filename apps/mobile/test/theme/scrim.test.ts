/**
 * Feature 005, contract C5-10 — scrims, sky and the passport card as data
 * (`src/theme/scrim.ts`). The contrast of every stop under text is the gate's job
 * (`contrast-gate.test.ts`, P8, P10, P23); this file pins the values themselves and the
 * three small helpers a consumer needs.
 */
import { contrastRatio } from '@/theme/contrast';
import { Palettes, PaletteNames } from '@/theme/palette';
import {
  CoverGlow,
  Passport,
  Scrim,
  Sky,
  colourAt,
  scrimSpec,
  withAlpha,
  type GradientStop,
} from '@/theme/scrim';

describe('Scrim — C5-10', () => {
  test('the base scrim is rgba(8, 26, 48): .68 held to 44 percent then 0, 0 to .88 at the bottom', () => {
    expect(Scrim.base.rgb).toBe('#081A30');
    expect(Scrim.base.top).toEqual({ alpha: 0.68, holdTo: 0.44, height: 120 });
    expect(Scrim.base.bottom).toEqual([
      { at: 0, alpha: 0 },
      { at: 0.25, alpha: 0.38 },
      { at: 0.55, alpha: 0.66 },
      { at: 1, alpha: 0.88 },
    ]);
  });

  test('the contrast scrim is rgba(6, 18, 34): .80 at the top, 0 / .50 / .78 / .94 at the bottom', () => {
    expect(Scrim.contrast.rgb).toBe('#061222');
    expect(Scrim.contrast.top.alpha).toBe(0.8);
    expect(Scrim.contrast.bottom.map((stop) => stop.alpha)).toEqual([0, 0.5, 0.78, 0.94]);
  });

  test('the caption scrim is a 48 dp ramp to .66 then a block to .88 (contrast .78 to .94)', () => {
    expect(Scrim.base.caption).toEqual({
      rampHeight: 48,
      rampTo: 0.66,
      blockTo: 0.88,
      minUnderText: 0.64,
    });
    expect(Scrim.contrast.caption).toMatchObject({
      rampTo: 0.78,
      blockTo: 0.94,
      minUnderText: 0.78,
    });
  });

  test('every bottom scrim rises with its position, from nothing', () => {
    for (const spec of [Scrim.base, Scrim.contrast]) {
      expect(spec.bottom[0].alpha).toBe(0);
      for (let index = 1; index < spec.bottom.length; index += 1) {
        expect(spec.bottom[index].at).toBeGreaterThan(spec.bottom[index - 1].at);
        expect(spec.bottom[index].alpha).toBeGreaterThan(spec.bottom[index - 1].alpha);
      }
    }
  });

  test('the contrast scrims are darker than the base at every shared stop', () => {
    Scrim.base.bottom.forEach((stop, index) => {
      expect(Scrim.contrast.bottom[index].alpha).toBeGreaterThanOrEqual(stop.alpha);
    });
    expect(Scrim.contrast.caption.minUnderText).toBeGreaterThan(
      Scrim.base.caption.minUnderText,
    );
  });

  test('scrimSpec picks the contrast scrims for the contrast themes only', () => {
    expect(scrimSpec(false)).toBe(Scrim.base);
    expect(scrimSpec(true)).toBe(Scrim.contrast);
  });

  test('is deeply frozen', () => {
    expect(Object.isFrozen(Scrim)).toBe(true);
    expect(Object.isFrozen(Scrim.base.bottom)).toBe(true);
  });
});

describe('withAlpha', () => {
  test('writes #RRGGBBAA in upper case, the alpha rounded to a byte', () => {
    expect(withAlpha('#081A30', 0.68)).toBe('#081A30AD');
    expect(withAlpha('#081a30', 0.5)).toBe('#081A3080');
    expect(withAlpha('#FFFFFF', 0)).toBe('#FFFFFF00');
    expect(withAlpha('#FFFFFF', 1)).toBe('#FFFFFFFF');
  });

  test('refuses a colour that is not #RRGGBB and an alpha outside 0 to 1', () => {
    expect(() => withAlpha('#FFF', 0.5)).toThrow(/#RRGGBB/);
    expect(() => withAlpha('#FFFFFFAA', 0.5)).toThrow(/#RRGGBB/);
    expect(() => withAlpha('#FFFFFF', 1.1)).toThrow(RangeError);
    expect(() => withAlpha('#FFFFFF', -0.1)).toThrow(RangeError);
    expect(() => withAlpha('#FFFFFF', Number.NaN)).toThrow(RangeError);
  });
});

describe('Sky — C5-10', () => {
  test('the light sky is the four warm-to-cool stops and one amber glow at the top right', () => {
    expect(Sky.light.stops).toEqual([
      { at: 0, colour: '#FFF1DF' },
      { at: 0.2, colour: '#FFE6D0' },
      { at: 0.56, colour: '#D7F0F6' },
      { at: 1, colour: '#EEF9FC' },
    ]);
    expect(Sky.light.glows).toEqual([
      {
        colour: '#FFB547',
        alpha: 0.46,
        centre: [0.92, -0.08],
        radius: [1.2, 0.7],
        fadeAt: 0.62,
      },
    ]);
  });

  test('the dark sky is Nightfall: four stops from the canvas to the surface, two soft glows', () => {
    expect(Sky.dark.stops.map((stop) => stop.colour)).toEqual([
      '#0A1626',
      '#0B1D36',
      '#0C2442',
      '#0F2037',
    ]);
    expect(Sky.dark.stops[0].colour).toBe(Palettes.dark.canvas);
    expect(Sky.dark.stops[3].colour).toBe(Palettes.dark.surface);
    expect(Sky.dark.glows).toHaveLength(2);
  });

  test.each(['light', 'dark'] as const)(
    'the %s stops run from 0 to 1 in order',
    (scheme) => {
      const { stops } = Sky[scheme];
      expect(stops[0].at).toBe(0);
      expect(stops[stops.length - 1].at).toBe(1);
      stops
        .slice(1)
        .forEach((stop, index) => expect(stop.at).toBeGreaterThan(stops[index].at));
    },
  );

  test('every glow is a faint wash that fades before its box ends', () => {
    for (const glow of [...Sky.light.glows, ...Sky.dark.glows]) {
      expect(glow.alpha).toBeGreaterThan(0);
      expect(glow.alpha).toBeLessThanOrEqual(0.5);
      expect(glow.fadeAt).toBeGreaterThan(0);
      expect(glow.fadeAt).toBeLessThanOrEqual(1);
    }
  });
});

describe('Passport — C5-10', () => {
  test('is a 135 degree gradient from the first cover, in every theme', () => {
    expect(Passport.stops).toEqual(['#0E2A47', '#0F4C5C']);
    expect(Passport.angle).toBe(135);
    for (const name of PaletteNames) {
      expect([Palettes[name].cover1Start, Palettes[name].cover1End]).toEqual([
        ...Passport.stops,
      ]);
    }
  });

  test('has a faint amber glow in the top right corner', () => {
    expect(Passport.glow).toEqual({
      colour: '#FFB547',
      alpha: 0.2,
      centre: [1, 0],
      radius: [0.7, 0.9],
      fadeAt: 0.62,
    });
  });

  test('a generated cover has its own, stronger corner glow: .62 amber, 85% by 95%, gone at 62%', () => {
    expect(CoverGlow).toEqual({
      colour: '#FFB547',
      alpha: 0.62,
      centre: [1, 0],
      radius: [0.85, 0.95],
      fadeAt: 0.62,
    });
  });

  test('its secondary white is .78 in the base themes and opaque in the contrast ones', () => {
    expect(Passport.secondaryAlpha).toEqual({ base: 0.78, contrast: 1 });
  });

  test('white text on the stops is 14.57:1 and 9.51:1', () => {
    expect(contrastRatio('#FFFFFF', Passport.stops[0])).toBeCloseTo(14.57, 1);
    expect(contrastRatio('#FFFFFF', Passport.stops[1])).toBeCloseTo(9.51, 1);
  });
});

describe('colourAt', () => {
  const stops: GradientStop[] = [
    { at: 0, colour: '#000000' },
    { at: 0.5, colour: '#FFFFFF' },
    { at: 1, colour: '#FF0000' },
  ];

  test('is a stop at its own position', () => {
    expect(colourAt(stops, 0)).toBe('#000000');
    expect(colourAt(stops, 0.5)).toBe('#FFFFFF');
    expect(colourAt(stops, 1)).toBe('#FF0000');
  });

  test('mixes the two stops that bracket a position, in sRGB', () => {
    expect(colourAt(stops, 0.25)).toBe('#808080');
    expect(colourAt(stops, 0.75)).toBe('#FF8080');
  });

  test('clamps a position outside the box to the first and the last stop', () => {
    expect(colourAt(stops, -0.08)).toBe('#000000');
    expect(colourAt(stops, 7)).toBe('#FF0000');
  });

  test('holds the last stop when the stops end before 1', () => {
    expect(
      colourAt(
        [
          { at: 0, colour: '#112233' },
          { at: 0.4, colour: '#445566' },
        ],
        0.9,
      ),
    ).toBe('#445566');
  });

  test('is the colour a glow sits over at its centre: the light sky is warmest at the top', () => {
    expect(colourAt(Sky.light.stops, Sky.light.glows[0].centre[1])).toBe('#FFF1DF');
  });
});
