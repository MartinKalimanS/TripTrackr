/**
 * `CategoryBar` - the segmented category bar and its legend (feature 005, T550; FR-047; research
 * D5-15; prototype `.catbar`, `.legend`; pictures `more/expenses*.png`): one 12 dp pill split in
 * the shares of each category's spending (2 dp between the segments, none under 6 dp wide, the
 * ends rounded), and under it the legend: a 12 dp swatch, the category's name and its total in bold.
 *
 *   <CategoryBar slices={view.slices} homeCurrency="EUR" />
 *
 * The shares are `CategorySlice.share` (a ratio of exact sums); a category with a refund and no
 * spending has no segment but keeps its legend entry. The legend names every category, so a
 * colour is never the only carrier of one (FR-025). The bar is ONE image to a screen reader
 * ("Food 67 percent, Transport 33 percent"); each legend entry is one element ("Food, 562 EUR")
 * with the id `summary-category-<id>`. Colours: `category-look.ts`. Nothing is drawn with no
 * categories.
 */
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { CategorySlice } from '@/features/expenses/spending-summary';
import { formatMoney, formatMoneyTight } from '@/lib/locale';
import { Radii, Space } from '@/theme';

import { CATEGORY_LOOKS, useCategoryColors } from './category-look';

const BAR_HEIGHT = 12;
const SEGMENT_GAP = 2;
const MIN_SEGMENT = 6;
const SWATCH = 12;

export type CategoryBarProps = {
  slices: readonly CategorySlice[];
  homeCurrency: string;
};

/** "Food 67 percent, Transport 33 percent". */
export function describeShares(slices: readonly CategorySlice[]): string {
  return slices
    .filter((slice) => slice.share > 0)
    .map((slice) => `${slice.name} ${Math.round(slice.share)} percent`)
    .join(', ');
}

function Segments({ slices }: { slices: readonly CategorySlice[] }) {
  const colors = useCategoryColors();
  const drawn = slices.filter((slice) => slice.share > 0);
  const last = drawn.length - 1;
  return (
    <View
      testID="category-bar"
      accessible
      accessibilityRole="image"
      accessibilityLabel={describeShares(slices)}
      className="flex-row overflow-hidden"
      style={{ gap: SEGMENT_GAP, height: BAR_HEIGHT, borderRadius: Radii.full }}>
      {drawn.map((slice, index) => (
        <View
          key={slice.id}
          testID={`category-segment-${slice.id}`}
          style={{
            flexGrow: slice.share,
            flexBasis: 0,
            minWidth: MIN_SEGMENT,
            backgroundColor: colors[CATEGORY_LOOKS[slice.tone].line],
            borderTopLeftRadius: index === 0 ? Radii.full : 0,
            borderBottomLeftRadius: index === 0 ? Radii.full : 0,
            borderTopRightRadius: index === last ? Radii.full : 0,
            borderBottomRightRadius: index === last ? Radii.full : 0,
          }}
        />
      ))}
    </View>
  );
}

function LegendEntry({
  slice,
  homeCurrency,
}: {
  slice: CategorySlice;
  homeCurrency: string;
}) {
  const colors = useCategoryColors();
  return (
    <View
      testID={`summary-category-${slice.id}`}
      accessible
      accessibilityLabel={`${slice.name}, ${formatMoney(slice.total, homeCurrency)}`}
      className="flex-row items-center"
      style={{ gap: Space[2], minHeight: 24 }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: SWATCH,
          height: SWATCH,
          borderRadius: 4,
          backgroundColor: colors[CATEGORY_LOOKS[slice.tone].line],
        }}
      />
      <Text variant="label" tone="muted">
        {slice.name}
      </Text>
      <Text variant="label" strong style={{ fontVariant: ['tabular-nums'] }}>
        {formatMoneyTight(slice.total, homeCurrency)}
      </Text>
    </View>
  );
}

export function CategoryBar({ slices, homeCurrency }: CategoryBarProps) {
  if (slices.length === 0) return null;
  return (
    <View testID="category-spending" style={{ paddingBottom: Space[5] }}>
      <Segments slices={slices} />
      <View
        className="flex-row flex-wrap"
        style={{ columnGap: Space[4], rowGap: Space[1], marginTop: Space[3] }}>
        {slices.map((slice) => (
          <LegendEntry key={slice.id} slice={slice} homeCurrency={homeCurrency} />
        ))}
      </View>
    </View>
  );
}
