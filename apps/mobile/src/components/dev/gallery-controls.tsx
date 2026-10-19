/**
 * The gallery's switches (feature 005, T524): the theme (the four of the palette) and the text
 * scale (1 and 2), and a readout of what the subtree below actually reads, so a screenshot says
 * which appearance it was taken in.
 *
 * The scale is a LAYOUT scale: the adapters take their minimum heights and their reflow from it,
 * but glyph size follows the system text size. For the true look at 2, set the phone's text
 * size to the largest AND choose 2 here (the readout shows the system scale).
 */
import { useWindowDimensions, View } from 'react-native';

import { ChipGroup } from '@/components/ui/chip';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Text } from '@/components/ui/text';
import { useAppearance } from '@/hooks/use-appearance';
import { PaletteNames, type PaletteName } from '@/theme/palette';

import { GALLERY_SCALES, type GalleryScale } from './gallery-model';

const THEME_OPTIONS = [
  {
    key: 'light',
    label: 'Light',
    testID: 'gallery-theme-light',
    accessibilityLabel: 'Light theme',
  },
  {
    key: 'dark',
    label: 'Dark',
    testID: 'gallery-theme-dark',
    accessibilityLabel: 'Dark theme',
  },
  {
    key: 'light-contrast',
    label: 'Light contrast',
    testID: 'gallery-theme-light-contrast',
    accessibilityLabel: 'Light contrast theme',
  },
  {
    key: 'dark-contrast',
    label: 'Dark contrast',
    testID: 'gallery-theme-dark-contrast',
    accessibilityLabel: 'Dark contrast theme',
  },
] as const satisfies readonly {
  key: PaletteName;
  label: string;
  testID: string;
  accessibilityLabel: string;
}[];

const SCALE_OPTIONS = [
  {
    key: '1',
    label: '1×',
    testID: 'gallery-scale-1',
    accessibilityLabel: 'Text scale 1',
  },
  {
    key: '2',
    label: '2×',
    testID: 'gallery-scale-2',
    accessibilityLabel: 'Text scale 2',
  },
] as const;

export interface GalleryControlsProps {
  theme: PaletteName;
  onTheme: (theme: PaletteName) => void;
  scale: GalleryScale;
  onScale: (scale: GalleryScale) => void;
}

/** What the subtree reads, in one line: the theme, the layout scale, the system scale. */
function Readout() {
  const { themeName, fontScale, prefersLessMotion, prefersLessTransparency } =
    useAppearance();
  const system = useWindowDimensions().fontScale;
  const flags = [
    prefersLessMotion ? 'reduced motion' : null,
    prefersLessTransparency ? 'reduced transparency' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Text variant="caption" tone="muted" testID="gallery-readout">
      {`${themeName} · layout ×${fontScale} · system text ×${system.toFixed(2)}${flags ? ` · ${flags}` : ''}`}
    </Text>
  );
}

/** The theme a chip's key names, or `undefined` for a key that is none. */
const themeOf = (key: string) => PaletteNames.find((name) => name === key);
const scaleOf = (key: string) => GALLERY_SCALES.find((scale) => String(scale) === key);

export function GalleryControls({
  theme,
  onTheme,
  scale,
  onScale,
}: GalleryControlsProps) {
  return (
    <View testID="gallery-controls" className="gap-2 px-4 pb-3 pt-2">
      <ChipGroup
        options={THEME_OPTIONS}
        selectedKey={theme}
        onSelect={(key) => {
          const next = themeOf(key);
          if (next) onTheme(next);
        }}
        accessibilityLabel="Theme"
      />
      <SegmentedPill
        size="sm"
        role="radiogroup"
        options={SCALE_OPTIONS}
        selectedKey={String(scale)}
        onSelect={(key) => {
          const next = scaleOf(key);
          if (next) onScale(next);
        }}
        accessibilityLabel="Text scale"
      />
      <Readout />
    </View>
  );
}
