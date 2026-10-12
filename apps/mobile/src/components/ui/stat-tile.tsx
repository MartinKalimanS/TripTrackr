/**
 * `StatTile` - one figure of the passport (feature 005; contract C5-18; FR-055, FR-074;
 * Q-1): a big tabular numeral, a lighter `of N` or unit beside it on the same baseline, the
 * label beneath, and an optional 16 dp glyph after the label.
 *
 *   <StatTile value={14} of={195} label="Countries" onPress={openCountries}
 *             testID="globe-stat-countries-tile" valueTestID="globe-stat-countries" />
 *   <StatTile value="61,480" unit="km" label="Kilometres" />
 *
 * - The numeral is the `numeral` role (Bricolage 700, 36 / 40, tabular, always capped at
 *   1.3 times the text size: Q-1), the `of N` and the unit the semibold `label` role in the
 *   `subtle` ink, the label the capped `caption`. `value` is the plain figure (a string the
 *   caller formatted with `Intl`, or a number), or an element when the figure counts up
 *   (`AnimatedNumber`); then `accessibilityLabel` is required, because the tile cannot
 *   compose a name from a node. `valueTestID` lands on the numeral itself, which is what a
 *   flow reads ("globe-stat-countries" is the plain number).
 * - It is announced ONCE, in words: "14 of 195 countries", "61,480 km distance", composed
 *   from the figure, `of`, `unit` and the lower-cased label unless the caller gives its own
 *   name. The tile is one accessibility element; its numeral and label are not read apart.
 * - With `onPress` it is ONE control (`Tappable`: role `button`, `busy` and `disabled`
 *   announced and inert, the scaled platform target, the focus ring) and names its cue (FR-024):
 *   a 16 dp chevron after the label, or the caller's own `icon`. Without it nothing opens,
 *   so no chevron is drawn unless the caller names a glyph. `<testID>-cue` is the glyph.
 * - At a font scale of 1.15 and above (`reflow.ts`) the tile is a row: the label on the
 *   left, the figure on the right (the prototype's `data-bigtext`), so three tiles stack
 *   instead of squeezing a 36 dp numeral into a third of the width.
 *
 * Ids: `testID` is the tile (the control, when it has one); `<testID>-layout` the arrangement
 * and `<testID>-figure` the numeral with its sibling. Colours are semantic classes.
 */
import type { ReactElement } from 'react';
import { View, type GestureResponderEvent } from 'react-native';

import { useAppearance } from '@/hooks/use-appearance';

import { assertAccessibleName } from './adapter-guards';
import { Icon, type IconName } from './icon';
import { CHEVRON } from './press-cue';
import { isLargeText } from './reflow';
import { Tappable } from './tappable';
import { Text } from './text';

interface StatTileBaseProps {
  /** The figure: formatted text, a number, or an element that counts up. */
  value: string | number | ReactElement;
  /** A denominator, shown as `/195` beside the figure. */
  of?: string | number;
  /** A unit, shown beside the figure (`km`). */
  unit?: string;
  label: string;
  /** The glyph after the label, 16 dp. A pressable tile defaults to a chevron. */
  icon?: IconName;
  /** What a screen reader says. Composed from the parts unless given; required for an element value. */
  accessibilityLabel?: string;
  testID?: string;
  /** Lands on the numeral. */
  valueTestID?: string;
}

export interface StatTileProps extends StatTileBaseProps {
  /** Makes the tile ONE control. */
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  busy?: boolean;
}

/** "14 of 195 countries": the parts in reading order, the label as a plain noun. */
export function statTileName({
  value,
  of,
  unit,
  label,
}: Pick<StatTileProps, 'value' | 'of' | 'unit' | 'label'>): string | undefined {
  if (typeof value === 'object') return undefined;
  return [
    String(value),
    of === undefined ? '' : `of ${of}`,
    unit ?? '',
    label.toLowerCase(),
  ]
    .filter(Boolean)
    .join(' ');
}

function Figure({ value, of, unit, valueTestID, testID }: StatTileBaseProps) {
  return (
    <View
      testID={testID ? `${testID}-figure` : undefined}
      className="max-w-full flex-row items-baseline gap-0.5">
      {typeof value === 'object' ? (
        value
      ) : (
        <Text variant="numeral" testID={valueTestID} numberOfLines={1}>
          {String(value)}
        </Text>
      )}
      {of === undefined ? null : (
        <Text variant="label" strong tone="subtle">{`/${of}`}</Text>
      )}
      {unit ? (
        <Text variant="label" strong tone="subtle">
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

function Caption({
  label,
  icon,
  testID,
}: Pick<StatTileBaseProps, 'label' | 'icon' | 'testID'>) {
  return (
    <View className="flex-row items-center gap-0.5">
      <Text variant="caption" capped tone="muted">
        {label}
      </Text>
      {icon ? (
        <Icon
          name={icon}
          size={16}
          tone="muted"
          testID={testID ? `${testID}-cue` : undefined}
        />
      ) : null}
    </View>
  );
}

function Layout(props: StatTileBaseProps & { large: boolean }) {
  const { large, testID } = props;
  const caption = <Caption label={props.label} icon={props.icon} testID={testID} />;
  const figure = <Figure {...props} />;
  return (
    <View
      testID={testID ? `${testID}-layout` : undefined}
      className={
        large
          ? 'flex-row items-center justify-between gap-3 py-2'
          : 'items-start gap-0.5 py-1'
      }>
      {large ? (
        <>
          {caption}
          {figure}
        </>
      ) : (
        <>
          {figure}
          {caption}
        </>
      )}
    </View>
  );
}

export function StatTile({
  onPress,
  disabled,
  busy,
  accessibilityLabel,
  icon,
  testID,
  ...parts
}: StatTileProps) {
  const { fontScale } = useAppearance();
  const name = accessibilityLabel ?? statTileName(parts);
  assertAccessibleName('StatTile', name);
  const glyph = icon ?? (onPress ? CHEVRON : undefined);
  const layout = (
    <Layout {...parts} icon={glyph} testID={testID} large={isLargeText(fontScale)} />
  );
  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={name}>
        {layout}
      </View>
    );
  }
  return (
    <Tappable
      testID={testID}
      accessibilityLabel={name as string}
      onPress={onPress}
      disabled={disabled}
      busy={busy}>
      {layout}
    </Tappable>
  );
}
