/**
 * 004 T441 (FR-014, FR-025): the glyph of an expense category. The six system categories
 * carry the icon keys the contracts package seeds (`food`, `lodging`, ...); a traveller's
 * own category carries none (the picker never sets one), so anything else draws the
 * generic glyph rather than nothing, and a key that happens to be a property of `Object`
 * is still just an unknown key.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';

import { categoryIconName } from '@/components/trip/category-icon';
import { isIconKey } from '@/components/ui/icon-registry';

describe('categoryIconName', () => {
  test('every system category has its own registry glyph', () => {
    const glyphs = SYSTEM_EXPENSE_CATEGORIES.map((category) =>
      categoryIconName(category.icon),
    );

    for (const glyph of glyphs) expect(isIconKey(glyph)).toBe(true);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  test.each([null, undefined, '', 'coffee', '  food', 'constructor', '__proto__'])(
    'draws the generic glyph for %p',
    (icon) => {
      expect(categoryIconName(icon)).toEqual(categoryIconName('other'));
    },
  );
});
