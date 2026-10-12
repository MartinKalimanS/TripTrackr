/**
 * `AreaPill` - one area of a trip as a count pill (feature 005; contract C5-18; FR-055,
 * FR-069, FR-075): Photos, Notes, Expenses, Documents and Offline maps.
 *
 *   <AreaPill icon={PHOTOS} label="Photos" count={128} onPress={openPhotos}
 *             testID="trip-open-photos" />
 *   <AreaPill icon={WALLET} label="Expenses" count="842 EUR" private onPress={...} />
 *
 * - ONE control: a pressable cream `tile` `Card` (so the held fill, the focus ring that
 *   follows the corner, the scaled target and `busy` / `disabled` are the card's), named
 *   "Photos, 128". A private area adds ", only you can see this" and one that needs
 *   attention ", needs attention", so what the lock and the dot draw is also said.
 * - Look: 16 dp corners, the cream fill and a hairline, no lift; at least 72 dp tall (a
 *   minimum, so it grows with the text and the icon never clips); the icon (24 dp), the
 *   count (`callout`, one line, shrinking before it clips an amount) and the label (the
 *   capped `caption`, one line) stacked and centred. A trip lays four of them in a row,
 *   and two at a font scale of 1.15 and above (`areaColumns` in `reflow.ts`).
 * - `private` draws a 20 dp aqua-tint disc with a lock at the top right (`<testID>-lock`);
 *   `warn` a 1.5 dp `danger` ring and an 8 dp dot at the top left (`<testID>-warn`). Both
 *   are decorative: the name carries them, and neither is colour alone (a lock, a dot and
 *   the words).
 *
 * `testID` lands on the control (`trip-open-photos`, ...); the tile inside it is
 * `<testID>-surface`. Colours are semantic classes and `useThemeColor`, never a literal.
 */
import { useThemeColor } from 'heroui-native';
import { View, useWindowDimensions, type GestureResponderEvent } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';

import { assertAccessibleName } from './adapter-guards';
import { Card } from './card';
import { Icon, type IconName } from './icon';
import { Text } from './text';

export interface AreaPillProps {
  icon: IconName;
  /** The area: "Photos". Names the control, so it may not be blank. */
  label: string;
  /** How many, or a formatted amount: `128`, `842 EUR`. */
  count: number | string;
  /** Only the traveller can see this area (Expenses, Documents): draws the lock. */
  private?: boolean;
  /** The area needs attention (an upload failed): draws the danger ring and dot. */
  warn?: boolean;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}

/** The pill is at least this tall; the platform target, scaled, may ask for more. */
export const AREA_MIN_HEIGHT = 72;

const LOCK: IconName = { ios: 'lock', android: 'lock' };
const WARN_RING = 1.5;

/** "Photos, 128, only you can see this, needs attention". */
export function areaPillName({
  label,
  count,
  private: isPrivate,
  warn,
}: Pick<AreaPillProps, 'label' | 'count' | 'private' | 'warn'>): string {
  return [
    label,
    String(count),
    isPrivate ? 'only you can see this' : '',
    warn ? 'needs attention' : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function Lock({ testID }: { testID?: string }) {
  return (
    <View
      testID={testID ? `${testID}-lock` : undefined}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className="absolute right-1.5 top-1.5 size-5 items-center justify-center rounded-full bg-aqua-tint">
      <Icon name={LOCK} size={16} tone="default" />
    </View>
  );
}

function WarnDot({ testID }: { testID?: string }) {
  return (
    <View
      testID={testID ? `${testID}-warn` : undefined}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className="absolute left-1.5 top-1.5 size-2 rounded-full bg-danger"
    />
  );
}

/** The icon, the figure and the label, stacked and centred. */
function Figures({
  icon,
  label,
  count,
}: Pick<AreaPillProps, 'icon' | 'label' | 'count'>) {
  return (
    <>
      <Icon name={icon} size={24} tone="muted" />
      <Text
        variant="callout"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        className="max-w-full">
        {String(count)}
      </Text>
      <Text
        variant="caption"
        capped
        tone="muted"
        numberOfLines={1}
        className="max-w-full">
        {label}
      </Text>
    </>
  );
}

export function AreaPill({
  icon,
  label,
  count,
  private: isPrivate = false,
  warn = false,
  onPress,
  disabled,
  busy,
  testID,
}: AreaPillProps) {
  assertAccessibleName('AreaPill', label);
  const { fontScale } = useWindowDimensions();
  const danger = useThemeColor('danger');
  const minHeight = Math.max(AREA_MIN_HEIGHT, MinTouchTarget * Math.max(1, fontScale));
  return (
    <Card
      variant="tile"
      radius="lg"
      cue={false}
      testID={testID}
      accessibilityLabel={areaPillName({ label, count, private: isPrivate, warn })}
      onPress={onPress}
      disabled={disabled}
      busy={busy}
      style={{ minHeight }}
      innerClassName="min-h-[72px] items-center justify-center gap-0.5 px-1.5 pb-2 pt-2.5"
      innerStyle={warn ? { borderColor: danger, borderWidth: WARN_RING } : undefined}>
      <Figures icon={icon} label={label} count={count} />
      {isPrivate ? <Lock testID={testID} /> : null}
      {warn ? <WarnDot testID={testID} /> : null}
    </Card>
  );
}
