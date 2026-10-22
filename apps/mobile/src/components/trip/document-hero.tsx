/**
 * `DocumentHero` - the scan as the hero of the viewer (feature 005, T552; FR-050; UI-SPEC 9.2;
 * prototype `.scan`, `.sc-top`; picture `more/document-view`): a card on the second lift, 16 dp
 * round, tilted one degree, with a navy band across the top (the kind of document at the start
 * and, once the traveller has confirmed it, the flight at the end) over the `BarcodePlate` that
 * holds the traveller's own picture.
 *
 *   <DocumentHero kindLabel="Boarding pass" flight="AC834">{picture}</DocumentHero>
 *
 * Only what the app knows is drawn: the pictured route, gate and seat are the scan's own
 * content, so they are in the picture the traveller took and nowhere else. The band is the
 * `accentInk` navy with an `onPhoto` white label, the same in every theme (the plate under it is
 * white in every theme), 8.9:1 or better. The tilt is the picture's; nothing on the card is a
 * control. The card is decoration around the picture, whose own name and role are the image's.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useLiftStyle } from '@/components/ui/lift';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import { Space, cornerOf } from '@/theme';

import { BarcodePlate } from './barcode-plate';

export interface DocumentHeroProps {
  kindLabel: string;
  /** The confirmed flight number, or none. */
  flight: string | null;
  children: ReactNode;
}

const COLOR_KEYS = ['accentInk'] as const;
const TILT = '-1deg';

export function DocumentHero({ kindLabel, flight, children }: DocumentHeroProps) {
  const lift = useLiftStyle('lift2');
  const { accentInk } = useColors(COLOR_KEYS);

  return (
    <View
      testID="document-hero"
      style={[cornerOf('lg'), lift, { transform: [{ rotate: TILT }] }]}>
      <View style={[cornerOf('lg'), { overflow: 'hidden' }]}>
        <View
          testID="document-hero-band"
          className="flex-row items-center justify-between"
          style={{
            backgroundColor: accentInk,
            paddingHorizontal: Space[4],
            paddingVertical: Space[3],
            gap: Space[3],
          }}>
          <Text
            variant="label"
            strong
            tone="onPhoto"
            numberOfLines={1}
            className="shrink"
            testID="document-hero-kind">
            {kindLabel}
          </Text>
          {flight ? (
            <Text variant="label" strong tone="onPhoto" testID="document-hero-flight">
              {flight}
            </Text>
          ) : null}
        </View>
        <BarcodePlate>{children}</BarcodePlate>
      </View>
    </View>
  );
}
