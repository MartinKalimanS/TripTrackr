/**
 * The dev gallery (feature 005, T524; research D5-18; contract C5-13 rule 5): every adapter in
 * the four themes at text scale 1 and 2, on a phone, in one scrolling page.
 *
 * It is reachable ONLY in development: the root layout admits the `(dev)` group behind
 * `Stack.Protected guard={__DEV__}`, and the route loads this module with a `require` inside an
 * `if (__DEV__)`, which the release bundler removes with the branch. Open it with the link
 * `com.triptrackr.app.dev:///gallery` (see `apps/mobile/README.md`).
 *
 * The page is painted by `AppearanceScope`, so the theme and the scale switch live and apply
 * to everything below the controls, the controls included. Nothing in `src/` outside
 * `app/(dev)` and `components/dev` imports this folder; a source test says so.
 */
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppearanceScope } from '@/components/ui/appearance-scope';
import { useAppearance } from '@/hooks/use-appearance';
import type { PaletteName } from '@/theme/palette';

import { GalleryControls } from './gallery-controls';
import { SECTION_IDS, type GalleryScale } from './gallery-model';
import { GALLERY_SECTIONS } from './gallery-sections';

export interface GalleryProps {
  /** The theme to open in. Default `light`. */
  initialTheme?: PaletteName;
  /** The text scale to open at. Default 1. */
  initialScale?: GalleryScale;
}

function GalleryPage({
  theme,
  onTheme,
  scale,
  onScale,
}: {
  theme: PaletteName;
  onTheme: (theme: PaletteName) => void;
  scale: GalleryScale;
  onScale: (scale: GalleryScale) => void;
}) {
  const { top } = useSafeAreaInsets();
  const { theme: scheme } = useAppearance();
  return (
    <View testID="gallery" className="flex-1 bg-background" style={{ paddingTop: top }}>
      {/* The status bar follows the scoped theme while the gallery is open, then the root's. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <GalleryControls theme={theme} onTheme={onTheme} scale={scale} onScale={onScale} />
      <ScrollView testID="gallery-scroll" contentContainerStyle={styles.content}>
        {SECTION_IDS.map((id) => {
          const Section = GALLERY_SECTIONS[id];
          return <Section key={id} />;
        })}
      </ScrollView>
    </View>
  );
}

export function Gallery({ initialTheme = 'light', initialScale = 1 }: GalleryProps) {
  const [theme, setTheme] = useState<PaletteName>(initialTheme);
  const [scale, setScale] = useState<GalleryScale>(initialScale);
  return (
    <AppearanceScope theme={theme} fontScale={scale}>
      <GalleryPage theme={theme} onTheme={setTheme} scale={scale} onScale={setScale} />
    </AppearanceScope>
  );
}

const styles = StyleSheet.create({
  content: { gap: 32, padding: 16, paddingBottom: 96 },
});
