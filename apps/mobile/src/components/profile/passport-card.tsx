/**
 * `PassportCard` - the navy passport of the You screen (feature 005, F13, T557; FR-058, FR-060,
 * FR-074, FR-076, FR-084; UI-SPEC sections 3.4 and 8; contract C5-10 `Passport`; Q-2; the
 * pictures `profile.png` and `profile-dark.png`; prototype `styles.css` `.passport`).
 *
 * A 135 degree navy gradient with a faint amber corner (`Scrim kind="passport"`, the same in
 * every theme, white text at 14.57:1 and 9.51:1 on its stops), 20 dp of padding, 16 between its
 * blocks, radius 24, `lift1`, clipped to its corners. A concentric watermark (nine rings and a
 * cross, 11 percent white) sits off its top right corner. Top to bottom:
 *
 * - the heading, an `eyebrow` "Passport . all time" (or the year) after a globe glyph;
 * - the figures, two by two (countries "/195", trips, distance, continents "/7"), each a
 *   numeral that counts up once, with the unit or the fixed denominator beside it and a
 *   `caption` label under it. From a font scale of 1.15 they stack in one column (SC-007). A
 *   figure is announced once, in words ("14 of 195 countries"), and its plain number is the
 *   visible text (`passport-countries`, `-trips`, `-distance`, `-continents`);
 * - the lap line, "1.5x around the Earth", from the real distance, left out when nothing was
 *   travelled;
 * - the machine-readable strip, decorative and hidden from assistive technology.
 *
 * The numbers are the ones given: the app's own statistic for the period (`passportTotals`),
 * never a figure of its own; 195 and 7 are the fixed references of Q-2. Secondary white
 * (the denominators, the labels, the strip) is the data's `secondaryAlpha`, a solid colour
 * that is white at that alpha (contrast themes: fully opaque). The kilometres follow the
 * device's measurement system, as the Home sheet does. Privacy: private, local, nothing sent.
 */
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { AnimatedNumber } from '@/components/ui/animated-number';
import { Icon } from '@/components/ui/icon';
import { useLiftStyle } from '@/components/ui/lift';
import { isLargeText } from '@/components/ui/reflow';
import { Scrim } from '@/components/ui/scrim';
import { Text } from '@/components/ui/text';
import { countOf, figureFormat } from '@/features/home/home-format';
import {
  lapText,
  mrzLine,
  passportHeading,
  passportName,
} from '@/features/passport/passport-copy';
import type { PassportTotals } from '@/features/passport/passport-totals';
import { useAppearance } from '@/hooks/use-appearance';
import { deviceLocale, distanceFigure, formatDistance } from '@/lib/locale';
import { Motion, Palettes, Passport, Radii, Space, withAlpha } from '@/theme';

export interface PassportCardProps {
  totals: PassportTotals;
  /** The traveller's display name: the machine-readable strip is made from it. */
  holder: string;
}

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

const RING_RADII = Array.from({ length: 9 }, (_, index) => 16 + index * 10);

/** Nine rings and a cross, off the top right corner: the prototype's `.wm` (300 dp, 11 percent). */
function Watermark({ colour }: { colour: string }) {
  return (
    <View
      testID="passport-watermark"
      pointerEvents="none"
      {...HIDDEN}
      style={{ position: 'absolute', right: -90, top: -80, width: 300, height: 300 }}>
      <Svg width={300} height={300} viewBox="0 0 200 200" fill="none">
        {RING_RADII.map((radius) => (
          <Circle
            key={radius}
            cx={100}
            cy={100}
            r={radius}
            stroke={colour}
            strokeWidth={1}
          />
        ))}
        <Path d="M100 4v192M4 100h192" stroke={colour} strokeWidth={1} opacity={0.6} />
      </Svg>
    </View>
  );
}

interface FigureProps {
  name: string;
  value: number;
  /** After the numeral: "/195", "km", or nothing. */
  small?: string;
  label: string;
  spoken: string;
  index: number;
  secondary: string;
}

/** One figure: the numeral and its small part on one baseline, the label under it. */
function Figure({ name, value, small, label, spoken, index, secondary }: FigureProps) {
  return (
    <View
      testID={`passport-figure-${name}`}
      accessible
      accessibilityLabel={spoken}
      className="min-w-0 flex-1">
      <View className="flex-row items-baseline gap-0.5">
        <AnimatedNumber
          value={value}
          format={figureFormat(value)}
          delay={index * Motion.countUpStaggerMs}
          tone="onPhoto"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          testID={`passport-${name}`}
        />
        {small === undefined ? null : (
          <Text variant="label" strong tone="onPhoto" style={{ color: secondary }}>
            {small}
          </Text>
        )}
      </View>
      <Text variant="caption" tone="onPhoto" style={{ color: secondary }}>
        {label}
      </Text>
    </View>
  );
}

function figuresOf(totals: PassportTotals, secondary: string): FigureProps[] {
  const locale = deviceLocale();
  const { languageTag } = locale;
  const distance = distanceFigure(totals.distanceKm, locale);
  const grouped = (count: number) => new Intl.NumberFormat(languageTag).format(count);
  return [
    {
      name: 'countries',
      value: totals.countries,
      small: `/${totals.countriesOf}`,
      label: totals.countries === 1 ? 'Country' : 'Countries',
      spoken: `${grouped(totals.countries)} of ${totals.countriesOf} countries`,
    },
    {
      name: 'trips',
      value: totals.trips,
      label: totals.trips === 1 ? 'Trip' : 'Trips',
      spoken: countOf(totals.trips, 'trip', 'trips', languageTag),
    },
    {
      name: 'distance',
      value: distance.value,
      small: distance.unit,
      label: 'Distance',
      spoken: `${formatDistance(totals.distanceKm, locale).spoken} travelled`,
    },
    {
      name: 'continents',
      value: totals.continents,
      small: `/${totals.continentsOf}`,
      label: totals.continents === 1 ? 'Continent' : 'Continents',
      spoken: `${grouped(totals.continents)} of ${totals.continentsOf} continents`,
    },
  ].map((figure, index) => ({ ...figure, index, secondary }));
}

export function PassportCard({ totals, holder }: PassportCardProps) {
  const { themeName, prefersMoreContrast, fontScale } = useAppearance();
  const lift = useLiftStyle('lift1');
  const palette = Palettes[themeName];
  const alpha = prefersMoreContrast
    ? Passport.secondaryAlpha.contrast
    : Passport.secondaryAlpha.base;
  const secondary = withAlpha(palette.onPhoto, alpha);
  const figures = figuresOf(totals, secondary);
  const stacked = isLargeText(fontScale);
  const lap = lapText(totals.laps, deviceLocale().languageTag);

  return (
    <View
      testID="passport-card"
      accessible
      accessibilityLabel={passportName(totals.period)}
      style={[
        {
          padding: Space[5],
          gap: Space[4],
          borderRadius: Radii.xl,
          borderCurve: 'continuous',
          overflow: 'hidden',
        },
        lift,
      ]}>
      <Scrim kind="passport" testID="passport-card-cover" />
      <Watermark colour={withAlpha(palette.onPhoto, 0.11)} />
      <View className="flex-row items-center gap-2">
        <Icon name="globe" size={20} tone="onPhoto" />
        <Text variant="eyebrow" tone="onPhoto">
          {passportHeading(totals.period)}
        </Text>
      </View>
      <View testID="passport-grid" style={{ gap: Space[4] }}>
        {[figures.slice(0, 2), figures.slice(2)].map((pair, row) => (
          <View
            key={row}
            testID={`passport-grid-row-${row}`}
            style={{
              flexDirection: stacked ? 'column' : 'row',
              columnGap: Space[5],
              rowGap: Space[4],
            }}>
            {pair.map((figure) => (
              <Figure key={figure.name} {...figure} />
            ))}
          </View>
        ))}
      </View>
      {lap === null ? null : (
        <View className="flex-row items-center gap-2">
          <Icon name="globe" size={20} tone="amber" />
          <Text variant="label" strong tone="onPhoto" className="shrink">
            {lap}
          </Text>
        </View>
      )}
      <Text
        testID="passport-mrz"
        variant="caption"
        numberOfLines={1}
        ellipsizeMode="clip"
        {...HIDDEN}
        style={{ color: secondary, letterSpacing: 2.16, fontSize: 12, lineHeight: 16 }}>
        {mrzLine(holder)}
      </Text>
    </View>
  );
}
