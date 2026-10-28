/**
 * `BarcodePlate` - the white plate a document's picture (and the barcode on it) sits on (feature
 * 005, T552; FR-050; UI-SPEC 9.2: "the barcode on a white plate"; prototype `.scan` and `.qr`).
 *
 *   <BarcodePlate><Image ... /></BarcodePlate>
 *
 * A barcode is read by a scanner as dark on light, whatever the traveller's theme: in Nightfall
 * a boarding pass on a navy page would be unreadable at a gate. So the plate is ALWAYS the
 * opaque white of `onPhoto` (the token that is white in all four themes: no literal), with
 * 16 dp of quiet zone round the picture, and nothing translucent, tinted or drawn across what
 * it holds (FR-033). It is a container: it announces nothing, takes no press and offers no way
 * to copy, save or share what is on it (FR-032).
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useColors } from '@/components/ui/theme-tokens';
import { Space } from '@/theme';

const COLOR_KEYS = ['onPhoto'] as const;

export const PLATE_PADDING = Space[4];

export function BarcodePlate({ children }: { children: ReactNode }) {
  const { onPhoto } = useColors(COLOR_KEYS);
  return (
    <View
      testID="barcode-plate"
      style={{ backgroundColor: onPhoto, padding: PLATE_PADDING }}>
      {children}
    </View>
  );
}
