/**
 * The colours of a spending category (feature 005, T550; prototype `.xic`, `.catbar`, `.legend`;
 * pictures `more/expenses*.png`): the LINE colour of the category bar and the legend swatch, and
 * the TINT behind the category's icon in a row. Palette keys only, resolved in the active theme
 * by `useCategoryColors`, so the four themes agree (no literal colour here).
 *
 * Food is coral, Lodging amber, Transport aqua, Activities ink, Other success, as pictured.
 * Shopping and the traveller's own categories are not pictured and take the muted inks; the
 * legend always names the category, so a colour is never the only carrier of it (FR-025).
 */
import { useColors } from '@/components/ui/theme-tokens';
import type { CategoryTone } from '@/features/expenses/spending-summary';

const KEYS = [
  'accentLine',
  'accentTint',
  'amberLine',
  'amberTint',
  'aquaLine',
  'aquaTint',
  'ink',
  'sand',
  'success',
  'successTint',
  'muted',
  'subtle',
  'surfaceSecondary',
] as const;

export type CategoryColorKey = (typeof KEYS)[number];

export interface CategoryLook {
  line: CategoryColorKey;
  tint: CategoryColorKey;
}

export const CATEGORY_LOOKS: Readonly<Record<CategoryTone, CategoryLook>> = {
  food: { line: 'accentLine', tint: 'accentTint' },
  lodging: { line: 'amberLine', tint: 'amberTint' },
  transport: { line: 'aquaLine', tint: 'aquaTint' },
  activities: { line: 'ink', tint: 'sand' },
  other: { line: 'success', tint: 'successTint' },
  shopping: { line: 'muted', tint: 'surfaceSecondary' },
  custom: { line: 'subtle', tint: 'surfaceSecondary' },
};

/** The colours of every category look in the active theme, in one kit call. */
export function useCategoryColors(): Record<CategoryColorKey, string> {
  return useColors(KEYS);
}
