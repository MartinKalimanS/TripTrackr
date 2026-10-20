/**
 * T413 — contract C4-6, data-model §2, research D4-07.
 *
 * The type scale is data. A change to a size, a line height or a weight is a design
 * change, so every value is pinned here to the contract's table rather than to whatever
 * the module happens to export.
 */
import {
  CappableInContext,
  CappedFontScale,
  LegacyRoleMap,
  TextRoleNames,
  TextRoles,
  TypeRoleNames,
  TypeRoles,
  fontClassOf,
  maxFontScaleOf,
  numericStyle,
  textStyle,
  typeExtras,
  typeStyle,
  type TextRole,
  type TypeRole,
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

/**
 * T515 — feature 005, contract C5-7, data-model section 2, research D5-06.
 *
 * The nine Sunrise roles (and the serif accent) are a SECOND table, `TypeRoles`, beside the
 * 004 `TextRoles` above: five names collide with 004 roles of another size (`title`,
 * `headline`, `callout`, `caption`, `body`) and the 004 call sites and tests pin the old
 * values, so the old table keeps its names until Phase 10 and `Text` selects the new one
 * with `variant`. Values are pinned here to the contract's table, not to what the module
 * happens to export.
 */
describe('TypeRoles — contract C5-7', () => {
  const expected = {
    display: { family: 'display', size: 40, lineHeight: 44, weight: 700, em: -0.035 },
    numeral: { family: 'display', size: 36, lineHeight: 40, weight: 700, em: -0.04 },
    title: { family: 'display', size: 28, lineHeight: 32, weight: 700, em: -0.03 },
    headline: { family: 'display', size: 22, lineHeight: 28, weight: 700, em: -0.02 },
    callout: { family: 'display', size: 17, lineHeight: 22, weight: 600, em: 0 },
    body: { family: 'body', size: 16, lineHeight: 24, weight: 400, em: 0 },
    label: { family: 'body', size: 14, lineHeight: 20, weight: 400, em: 0 },
    caption: { family: 'body', size: 13, lineHeight: 18, weight: 600, em: 0 },
    eyebrow: { family: 'body', size: 12, lineHeight: 16, weight: 700, em: 0.06 },
  } as const;

  test.each(Object.keys(expected) as (keyof typeof expected)[])(
    '%s matches the contract table',
    (role) => {
      const { em, ...rest } = expected[role];
      expect(TypeRoles[role]).toMatchObject({ ...rest, letterSpacingEm: em });
    },
  );

  test('the accent is the serif italic at 400, inheriting size and line height', () => {
    expect(TypeRoles.accent).toMatchObject({
      family: 'serif',
      size: null,
      lineHeight: null,
      weight: 400,
      letterSpacingEm: 0,
      tabularNumbers: false,
    });
  });

  test('exactly nine roles and the accent exist, in reading order', () => {
    expect([...TypeRoleNames]).toEqual([
      'display',
      'numeral',
      'title',
      'headline',
      'callout',
      'body',
      'label',
      'caption',
      'eyebrow',
      'accent',
    ]);
    expect(Object.keys(TypeRoles).sort()).toEqual([...TypeRoleNames].sort());
  });

  test('the scale is nine sizes and three weights, nothing else', () => {
    const sizes = TypeRoleNames.map((role) => TypeRoles[role].size).filter(
      (size): size is NonNullable<typeof size> => size !== null,
    );
    expect([...new Set(sizes)].sort((a, b) => a - b)).toEqual([
      12, 13, 14, 16, 17, 22, 28, 36, 40,
    ]);
    const weights = new Set(TypeRoleNames.map((role) => TypeRoles[role].weight));
    expect([...weights].sort()).toEqual([400, 600, 700]);
  });

  test('every line height exceeds its size, so enlarged text cannot clip (FR-074)', () => {
    for (const role of TypeRoleNames) {
      const { size, lineHeight } = TypeRoles[role];
      if (size === null || lineHeight === null) continue;
      expect(lineHeight).toBeGreaterThan(size);
    }
  });

  test('every tabular role is set in a Bricolage family: DM Sans has no tabular figures', () => {
    const tabular = TypeRoleNames.filter((role) => TypeRoles[role].tabularNumbers);
    expect(tabular).toEqual(['numeral']);
    for (const role of tabular) {
      expect(TypeRoles[role].family).toBe('display');
      expect(fontClassOf(TypeRoles[role].family, TypeRoles[role].weight)).toMatch(
        /^font-display(-bold)?$/,
      );
    }
  });

  test('only the eyebrow is upper case', () => {
    expect(TypeRoleNames.filter((role) => TypeRoles[role].uppercase)).toEqual([
      'eyebrow',
    ]);
  });

  test('is deeply frozen: a screen cannot retune a role', () => {
    expect(Object.isFrozen(TypeRoles)).toBe(true);
    for (const role of TypeRoleNames) expect(Object.isFrozen(TypeRoles[role])).toBe(true);
    const before = TypeRoles.body.size;
    try {
      (TypeRoles.body as { size: number | null }).size = 99;
    } catch {
      // Strict mode throws a TypeError; sloppy mode ignores the write. Either is fine.
    }
    expect(TypeRoles.body.size).toBe(before);
  });
});

describe('the 1.3 cap (FR-074)', () => {
  test('the cap is 1.3', () => {
    expect(CappedFontScale).toBe(1.3);
  });

  test('exactly the capped roles carry maxFontSizeMultiplier 1.3 and nothing else does', () => {
    const capped = TypeRoleNames.filter(
      (role) => TypeRoles[role].maxFontSizeMultiplier !== undefined,
    );
    expect(capped).toEqual(['numeral', 'eyebrow']);
    for (const role of capped) {
      expect(TypeRoles[role].maxFontSizeMultiplier).toBe(1.3);
    }
  });

  test('callout, label and caption are capped only in their chrome context', () => {
    expect([...CappableInContext]).toEqual(['callout', 'label', 'caption']);
    for (const role of CappableInContext) {
      expect(TypeRoles[role].maxFontSizeMultiplier).toBeUndefined();
    }
  });

  test.each([
    ['numeral', false, 1.3],
    ['eyebrow', false, 1.3],
    ['callout', true, 1.3],
    ['label', true, 1.3],
    ['caption', true, 1.3],
    ['callout', false, undefined],
    ['label', false, undefined],
    ['caption', false, undefined],
    ['display', true, undefined],
    ['title', true, undefined],
    ['headline', true, undefined],
    ['body', true, undefined],
    ['accent', true, undefined],
  ] as [TypeRole, boolean, number | undefined][])(
    '%s with capped=%s resolves to %s',
    (role, capped, multiplier) => {
      expect(maxFontScaleOf(role, capped)).toBe(multiplier);
    },
  );
});

describe('fontClassOf — the semantic font classes of the contract', () => {
  test.each([
    ['display', 700, 'font-display-bold'],
    ['display', 600, 'font-display'],
    ['body', 400, 'font-body'],
    ['body', 600, 'font-body-semibold'],
    ['body', 700, 'font-body-bold'],
    ['serif', 400, 'font-serif-italic'],
  ] as const)('%s at %s is %s', (family, weight, expectedClass) => {
    expect(fontClassOf(family, weight)).toBe(expectedClass);
  });

  test('refuses a face that is not bundled', () => {
    expect(() => fontClassOf('serif', 700)).toThrow(/serif.*700/);
    expect(() => fontClassOf('display', 400)).toThrow(/display.*400/);
  });

  test('every role resolves to one of the six bundled faces', () => {
    const classes = new Set(
      TypeRoleNames.map((role) =>
        fontClassOf(TypeRoles[role].family, TypeRoles[role].weight),
      ),
    );
    expect([...classes].sort()).toEqual(
      [
        'font-body',
        'font-body-bold',
        'font-body-semibold',
        'font-display',
        'font-display-bold',
        'font-serif-italic',
      ].sort(),
    );
  });
});

describe('typeStyle and typeExtras', () => {
  test('a plain role is its size, line height and tracking in dp (em times size)', () => {
    expect(typeStyle('display')).toEqual({
      fontSize: 40,
      lineHeight: 44,
      letterSpacing: -1.4,
    });
    expect(typeStyle('headline')).toEqual({
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.44,
    });
    expect(typeStyle('body')).toEqual({ fontSize: 16, lineHeight: 24 });
  });

  test('the numeral is tabular, the eyebrow upper case with positive tracking', () => {
    expect(typeStyle('numeral')).toEqual({
      fontSize: 36,
      lineHeight: 40,
      letterSpacing: -1.44,
      fontVariant: ['tabular-nums'],
    });
    expect(typeStyle('eyebrow')).toEqual({
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0.72,
      textTransform: 'uppercase',
    });
  });

  test('the accent inherits: no size, no line height', () => {
    expect(typeStyle('accent')).toEqual({});
  });

  test.each(TypeRoleNames)('%s sets no fixed width, height or font family', (role) => {
    const style = typeStyle(role) as Record<string, unknown>;
    expect(style.height).toBeUndefined();
    expect(style.width).toBeUndefined();
    expect(style.fontFamily).toBeUndefined();
    expect(style.maxFontSizeMultiplier).toBeUndefined();
  });

  test('typeExtras is typeStyle without the size and line height (classes carry those)', () => {
    expect(typeExtras('display')).toEqual({ letterSpacing: -1.4 });
    expect(typeExtras('numeral')).toEqual({
      letterSpacing: -1.44,
      fontVariant: ['tabular-nums'],
    });
    expect(typeExtras('body')).toEqual({});
    expect(typeExtras('eyebrow')).toEqual({
      letterSpacing: 0.72,
      textTransform: 'uppercase',
    });
  });

  test('returns a new object each call, so a caller may extend it', () => {
    expect(typeStyle('title')).not.toBe(typeStyle('title'));
    expect(typeStyle('title')).toEqual(typeStyle('title'));
    expect(typeStyle('numeral').fontVariant).not.toBe(typeStyle('numeral').fontVariant);
  });
});

describe('LegacyRoleMap — the 004 roles until Phase 10', () => {
  test('each 004 role maps to a Sunrise role: numeric to numeral, the rest by name', () => {
    expect(LegacyRoleMap).toEqual({
      largeTitle: 'display',
      title: 'title',
      headline: 'headline',
      body: 'body',
      callout: 'callout',
      caption: 'caption',
      numeric: 'numeral',
    });
    for (const role of Object.values(LegacyRoleMap)) {
      expect(TypeRoleNames).toContain(role);
    }
    expect(Object.keys(LegacyRoleMap).sort()).toEqual([...TextRoleNames].sort());
  });
});
