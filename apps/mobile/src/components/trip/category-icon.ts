/**
 * The glyph of an expense category — 004 T441 (FR-014, FR-025).
 *
 * The six system categories carry the icon keys the contracts package seeds on both sides
 * (`SYSTEM_EXPENSE_CATEGORIES`: `food`, `lodging`, `transport`, `activities`, `shopping`,
 * `other`). A traveller's own category carries no key (the picker never sets one) and the
 * wire allows any string, so every other value draws the generic glyph rather than nothing.
 * The keys sit in a `Map`: a plain object would answer `constructor` or `__proto__` with
 * something that is not an icon.
 *
 * Each is an `IconName` (an SF Symbol and a Material symbol, both platforms); the glyph is
 * decorative beside the category's name, never the only carrier of it.
 */
import type { IconName } from '@/components/ui/icon';

const GENERIC: IconName = { ios: 'tag', android: 'sell' };

const CATEGORY_ICONS: ReadonlyMap<string, IconName> = new Map([
  ['food', { ios: 'fork.knife', android: 'restaurant' }],
  ['lodging', { ios: 'bed.double', android: 'hotel' }],
  ['transport', { ios: 'tram', android: 'directions_transit' }],
  ['activities', { ios: 'ticket', android: 'local_activity' }],
  ['shopping', { ios: 'bag', android: 'shopping_bag' }],
  ['other', GENERIC],
]);

/** The glyph for a category's icon key; the generic one for none or an unknown key. */
export function categoryIconName(icon: string | null | undefined): IconName {
  return (icon ? CATEGORY_ICONS.get(icon) : undefined) ?? GENERIC;
}
