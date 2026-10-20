/**
 * T523 - the geometry of a passport stamp (feature 005; research D5-08), in the 120 by 120
 * box of the prototype's six shapes, as pure data and pure functions.
 *
 * SVG text does not follow Dynamic Type, so a long city has to be fitted by arithmetic: first
 * the letter spacing closes up, then the size shrinks, and never below a floor that a phone
 * can still read at the stamp's size.
 */
import {
  ADVANCE_EM,
  ARCS,
  MIN_SIZE,
  MIN_TRACKING,
  SHAPE_LAYOUT,
  fitLabel,
  octagonPoints,
  textWidth,
} from './stamp-layout';
import { STAMP_SHAPES } from './stamp-spec';

describe('fitLabel - the text of a stamp always fits its room', () => {
  test('leaves a short text as it is', () => {
    expect(fitLabel('PT', 90, 25, 0)).toEqual({ size: 25, tracking: 0 });
    expect(fitLabel('ROMA', 84, 10, 3)).toEqual({ size: 10, tracking: 3 });
  });

  test('closes the letter spacing first, keeping the size', () => {
    const fitted = fitLabel('LISBOA SINTRA', 100, 11, 2.2);
    expect(fitted.size).toBe(11);
    expect(fitted.tracking).toBeLessThan(2.2);
    expect(fitted.tracking).toBeGreaterThanOrEqual(MIN_TRACKING);
    expect(textWidth(13, fitted.size, fitted.tracking)).toBeLessThanOrEqual(100.01);
  });

  test('then shrinks the size, never below the floor', () => {
    const fitted = fitLabel('SANTIAGO DE COMP', 60, 11, 2.2);
    expect(fitted.tracking).toBe(MIN_TRACKING);
    expect(fitted.size).toBeLessThan(11);
    expect(fitted.size).toBeGreaterThanOrEqual(MIN_SIZE);
    const absurd = fitLabel('X'.repeat(40), 30, 11, 2.2);
    expect(absurd.size).toBe(MIN_SIZE);
  });

  test('is the identity on an empty text and never gives a negative spacing', () => {
    expect(fitLabel('', 50, 10, 2)).toEqual({ size: 10, tracking: 2 });
    for (const room of [10, 40, 80, 200]) {
      expect(fitLabel('LISBOA SINTRA', room, 10, 3).tracking).toBeGreaterThanOrEqual(0);
    }
  });

  test('measures a text as its characters times the advance plus the spacing', () => {
    expect(textWidth(4, 10, 2)).toBeCloseTo(4 * (ADVANCE_EM * 10 + 2));
    expect(textWidth(0, 10, 2)).toBe(0);
  });

  test('counts a character, not a UTF-16 unit', () => {
    expect(fitLabel('\u{1F30D}'.repeat(8), 200, 10, 0)).toEqual({
      size: 10,
      tracking: 0,
    });
  });
});

describe('octagonPoints - the prototype octagon, eight corners round the centre', () => {
  test('the outer ring is the prototype\u2019s, to a tenth of a unit', () => {
    expect(octagonPoints(58)).toBe(
      '113.6,82.2 82.2,113.6 37.8,113.6 6.4,82.2 6.4,37.8 37.8,6.4 82.2,6.4 113.6,37.8',
    );
  });

  test('the inner ring is the prototype\u2019s', () => {
    expect(octagonPoints(50)).toBe(
      '106.2,79.1 79.1,106.2 40.9,106.2 13.8,79.1 13.8,40.9 40.9,13.8 79.1,13.8 106.2,40.9',
    );
  });
});

describe('SHAPE_LAYOUT - every shape has its text laid out inside its rings', () => {
  test('covers the six shapes, each with a code and a date line inside the 120 box', () => {
    expect(Object.keys(SHAPE_LAYOUT).sort()).toEqual([...STAMP_SHAPES].sort());
    for (const shape of STAMP_SHAPES) {
      const layout = SHAPE_LAYOUT[shape];
      expect(layout.code.y).toBeGreaterThan(0);
      expect(layout.code.y).toBeLessThan(120);
      expect(layout.code.size).toBeGreaterThanOrEqual(25);
      expect(layout.code.size).toBeLessThanOrEqual(30);
    }
  });

  test('the circle and the scallop write the top on an arc, the others on a line', () => {
    expect(SHAPE_LAYOUT.circle.top.kind).toBe('arc');
    expect(SHAPE_LAYOUT.scallop.top.kind).toBe('arc');
    for (const shape of ['rect', 'hex', 'oct', 'oval'] as const) {
      expect(SHAPE_LAYOUT[shape].top.kind).toBe('line');
    }
  });

  test('only the circle writes the date on an arc', () => {
    expect(SHAPE_LAYOUT.circle.date.kind).toBe('arc');
    for (const shape of ['rect', 'hex', 'oct', 'scallop', 'oval'] as const) {
      expect(SHAPE_LAYOUT[shape].date.kind).toBe('line');
    }
  });

  test('an arc is a half circle through the box centre line, its room a share of its length', () => {
    expect(ARCS.circleTop).toMatchObject({ d: 'M 23 60 a 37 37 0 0 1 74 0' });
    expect(ARCS.circleBottom).toMatchObject({ d: 'M 15 60 a 45 45 0 0 0 90 0' });
    expect(ARCS.scallopTop).toMatchObject({ d: 'M 24 60 a 36 36 0 0 1 72 0' });
    expect(ARCS.circleTop.room).toBeLessThan(Math.PI * 37);
    expect(ARCS.circleBottom.room).toBeLessThan(Math.PI * 45);
    expect(ARCS.scallopTop.room).toBeLessThan(Math.PI * 36);
  });

  test('every line of text has room, a size and a spacing from the prototype', () => {
    for (const shape of STAMP_SHAPES) {
      for (const slot of ['top', 'date'] as const) {
        const line = SHAPE_LAYOUT[shape][slot];
        expect(line.room).toBeGreaterThan(40);
        expect(line.size).toBeGreaterThanOrEqual(10);
        expect(line.tracking).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
