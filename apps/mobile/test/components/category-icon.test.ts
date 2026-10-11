/**
 * 004 T441 (FR-014, FR-025): the glyph of an expense category. The six system categories
 * carry the icon keys the contracts package seeds (`food`, `lodging`, ...); a traveller's
 * own category carries none (the picker never sets one), so anything else draws the
 * generic glyph rather than nothing, and a key that happens to be a property of `Object`
 * is still just an unknown key.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';

import { categoryIconName } from '@/components/trip/category-icon';

describe('categoryIconName', () => {
  test('every system category has its own glyph on both platforms', () => {
    const glyphs = SYSTEM_EXPENSE_CATEGORIES.map((category) =>
      categoryIconName(category.icon),
    );

    for (const glyph of glyphs) {
      expect(typeof glyph.ios).toBe('string');
      expect(typeof glyph.android).toBe('string');
    }
    expect(new Set(glyphs.map((glyph) => glyph.ios)).size).toBe(glyphs.length);
    expect(new Set(glyphs.map((glyph) => glyph.android)).size).toBe(glyphs.length);
  });

  test.each([null, undefined, '', 'coffee', '  food', 'constructor', '__proto__'])(
    'draws the generic glyph for %p',
    (icon) => {
      expect(categoryIconName(icon)).toEqual(categoryIconName('other'));
    },
  );
});
