/**
 * T521 - the reflow threshold of `screens.md` (the prototype's `data-bigtext`): at a font
 * scale of 1.15 and above the stat tiles become rows and the area pills two columns.
 */
import { REFLOW_FONT_SCALE, areaColumns, isLargeText } from './reflow';

describe('reflow threshold', () => {
  test('is 1.15 times the default text size', () => {
    expect(REFLOW_FONT_SCALE).toBe(1.15);
  });

  test.each([
    [0.85, false],
    [1, false],
    [1.14, false],
    [1.15, true],
    [1.3, true],
    [2, true],
  ])('a font scale of %s is large text: %s', (fontScale, large) => {
    expect(isLargeText(fontScale)).toBe(large);
  });

  test('the areas are four columns, and two at large text', () => {
    expect(areaColumns(1)).toBe(4);
    expect(areaColumns(1.14)).toBe(4);
    expect(areaColumns(1.15)).toBe(2);
    expect(areaColumns(2)).toBe(2);
  });
});
