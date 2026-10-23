/**
 * `OfflineMapTile` - the 72 dp map tile of an offline city row (feature 005, F11; UI-SPEC
 * 9.2; prototype `.mthumb`, `.m-sea`, `.m-box`; picture `more/offline-maps`).
 *
 * A generated tile and no geography: the picture's land outlines would be invented
 * coastlines, so the tile is sea tint, a few hairline graticule lines and the saved area as
 * the picture draws it: a dashed coral box for a map not saved yet, a solid, softly filled
 * one for a map that is. It is decoration (hidden from assistive technology): the row says
 * the state in words. The soft fill is the coral at 14 percent; under increased contrast or
 * reduced transparency it is that colour already laid over the sea tint, so it is opaque
 * (FR-072, FR-073).
 */
import { View } from 'react-native';

import { useOpaqueSurfaces } from '@/components/ui/solid-ground';
import { useColors } from '@/components/ui/theme-tokens';
import { Radii, blend } from '@/theme';

export const MAP_TILE_SIZE = 72;
const BOX = { width: 32, height: 26 } as const;
const COLOR_KEYS = ['aquaTint', 'hairline', 'accentLine'] as const;
export const AREA_FILL = 0.14;
const GRATICULE = [24, 48] as const;

export type OfflineMapTileProps = {
  /** The city's map is saved on the device. */
  saved: boolean;
  /** The city's id: names the tile `offline-tile-<id>`, its area `-area` and fill `-fill`. */
  cityId: number;
};

export function OfflineMapTile({ saved, cityId }: OfflineMapTileProps) {
  const colors = useColors(COLOR_KEYS);
  const opaque = useOpaqueSurfaces();
  return (
    <View
      testID={`offline-tile-${cityId}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: MAP_TILE_SIZE,
        height: MAP_TILE_SIZE,
        borderRadius: Radii.md,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: colors.aquaTint,
        borderWidth: 1,
        borderColor: colors.hairline,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {GRATICULE.map((offset) => (
        <View
          key={`row-${offset}`}
          style={{
            position: 'absolute',
            top: offset - 1,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: colors.hairline,
          }}
        />
      ))}
      {GRATICULE.map((offset) => (
        <View
          key={`col-${offset}`}
          style={{
            position: 'absolute',
            left: offset - 1,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: colors.hairline,
          }}
        />
      ))}
      <View
        testID={`offline-tile-${cityId}-area`}
        style={{
          width: BOX.width,
          height: BOX.height,
          borderRadius: 6,
          borderWidth: 1.75,
          borderStyle: saved ? 'solid' : 'dashed',
          borderColor: colors.accentLine,
          overflow: 'hidden',
        }}>
        {saved ? (
          <View
            testID={`offline-tile-${cityId}-fill`}
            style={
              opaque
                ? {
                    flex: 1,
                    backgroundColor: blend(colors.accentLine, colors.aquaTint, AREA_FILL),
                  }
                : { flex: 1, backgroundColor: colors.accentLine, opacity: AREA_FILL }
            }
          />
        ) : null}
      </View>
    </View>
  );
}
