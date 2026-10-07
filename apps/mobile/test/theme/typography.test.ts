/**
 * T413 — contract C4-6, data-model §2, research D4-07.
 *
 * The type scale is data. A change to a size, a line height or a weight is a design
 * change, so every value is pinned here to the contract's table rather than to whatever
 * the module happens to export.
 */
import {
  TextRoleNames,
  TextRoles,
  numericStyle,
  textStyle,
  type TextRole,
} from '@/theme/typography';

describe('TextRoles — contract C4-6', () => {
  const expected = {
    largeTitle: { family: 'displayBold', size: 32, lineHeight: 38, weight: 700 },
    title: { family: 'display', size: 22, lineHeight: 28, weight: 600 },
    headline: { family: 'system', size: 17, lineHeight: 24, weight: 600 },
    body: { family: 'system', size: 16, lineHeight: 24, weight: 400 },
    callout: { family: 'system', size: 14, lineHeight: 20, weight: 500 },
    caption: { family: 'system', size: 12, lineHeight: 16, weight: 500 },
  } as const;

  test.each(Object.keys(expected) as (keyof typeof expected)[])(
    '%s matches the contract table',
    (role) => {
      expect(TextRoles[role]).toMatchObject(expected[role]);
    },
  );

  test('numeric is a tabular, semibold role in the system face', () => {
    expect(TextRoles.numeric).toMatchObject({
      family: 'system',
      weight: 600,
      tabularNumbers: true,
    });
  });

  test('exactly the seven roles of the contract exist, in reading order', () => {
    expect([...TextRoleNames]).toEqual([
      'largeTitle',
      'title',
      'headline',
      'body',
      'callout',
      'caption',
      'numeric',
    ]);
    expect(Object.keys(TextRoles).sort()).toEqual([...TextRoleNames].sort());
  });

  test('only numeric uses tabular numerals', () => {
    for (const role of TextRoleNames) {
      expect(TextRoles[role].tabularNumbers).toBe(role === 'numeric');
    }
  });

  test('the scale is five sizes plus the iOS headline', () => {
    const sizes = new Set(
      TextRoleNames.filter((role) => role !== 'numeric').map(
        (role) => TextRoles[role].size,
      ),
    );
    expect([...sizes].sort((a, b) => a - b)).toEqual([12, 14, 16, 17, 22, 32]);
  });

  test('every line height exceeds its size, so enlarged text cannot clip (FR-029)', () => {
    for (const role of TextRoleNames) {
      expect(TextRoles[role].lineHeight).toBeGreaterThan(TextRoles[role].size);
    }
  });

  test('only the display roles use the display face, at the two bundled weights', () => {
    const display = TextRoleNames.filter((role) => TextRoles[role].family !== 'system');
    expect(display).toEqual(['largeTitle', 'title']);
    expect(TextRoles.largeTitle.family).toBe('displayBold');
    expect(TextRoles.title.family).toBe('display');
  });

  test('is deeply frozen: a screen cannot retune a role', () => {
    expect(Object.isFrozen(TextRoles)).toBe(true);
    for (const role of TextRoleNames) expect(Object.isFrozen(TextRoles[role])).toBe(true);
    const before = TextRoles.body.size;
    try {
      (TextRoles.body as { size: number }).size = 99;
    } catch {
      // Strict mode throws a TypeError; sloppy mode ignores the write. Either is fine.
    }
    expect(TextRoles.body.size).toBe(before);
  });
});

describe('textStyle', () => {
  test('returns size, line height and a string weight for a plain role', () => {
    expect(textStyle('body')).toEqual({
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '400',
    });
  });

  test('carries tabular numerals only for the numeric role', () => {
    expect(textStyle('numeric').fontVariant).toEqual(['tabular-nums']);
    expect(textStyle('body').fontVariant).toBeUndefined();
  });

  test.each(TextRoleNames)('%s sets no fixed width or height', (role) => {
    const style = textStyle(role) as Record<string, unknown>;
    expect(style.height).toBeUndefined();
    expect(style.width).toBeUndefined();
  });

  test('does not choose a font family: the font adapter resolves the family token', () => {
    for (const role of TextRoleNames) {
      expect((textStyle(role) as Record<string, unknown>).fontFamily).toBeUndefined();
    }
  });

  test('returns a new object each call, so a caller may extend it', () => {
    expect(textStyle('title')).not.toBe(textStyle('title'));
    expect(textStyle('title')).toEqual(textStyle('title'));
  });
});

describe('numericStyle', () => {
  test('borrows the size and line height of the role it sits in', () => {
    const context: Exclude<TextRole, 'numeric'>[] = ['largeTitle', 'title', 'body'];
    for (const role of context) {
      const style = numericStyle(role);
      expect(style.fontSize).toBe(TextRoles[role].size);
      expect(style.lineHeight).toBe(TextRoles[role].lineHeight);
    }
  });

  test('is always semibold and tabular', () => {
    for (const role of ['largeTitle', 'headline', 'callout'] as const) {
      expect(numericStyle(role)).toMatchObject({
        fontWeight: '600',
        fontVariant: ['tabular-nums'],
      });
    }
  });

  test('defaults to the body size', () => {
    expect(numericStyle()).toEqual(numericStyle('body'));
  });
});
