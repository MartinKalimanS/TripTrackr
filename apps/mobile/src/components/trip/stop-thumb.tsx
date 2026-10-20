/**
 * `StopThumb` - a picture of the city of a stop (tasks.md T545; contract C5-20; spec FR-041,
 * FR-008, FR-076): the traveller's own photograph filed under that city if they have one, else
 * the generated thumbnail with the country's code (`GeneratedCover thumb`), so a stop never has
 * an empty box and nothing is fetched. A 56 dp rounded square (16 dp corners).
 *
 *   <StopThumb stopId={stop.id} cityId={stop.city_id} iso2={stop.country_iso} place="Sintra"
 *              uri={thumbs.get(stop.city_id)} />
 *
 * The photograph is the thumbnail file on the device, cover-fitted and recycled by city so a
 * reused row never shows the last stop's picture while the new one loads; if it will not draw
 * the generated thumbnail takes its place without moving anything. It is decoration: the stop's
 * name says the place, so the whole thing is hidden from assistive technology.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GeneratedCover, coverPalette } from '@/components/ui/generated-cover';
import { cornerOf } from '@/theme';

export interface StopThumbProps {
  /** The stop: the thumbnail is `stop-thumb-<id>`, its parts `-photo` and `-generated`. */
  stopId: string;
  cityId: number;
  /** The country's ISO alpha-2 code, or `null` when this device has not cached the city. */
  iso2: string | null | undefined;
  /** The city's name: its first letter stands in when there is no country code. */
  place: string;
  /** The thumbnail of the traveller's photograph of this city, or none. */
  uri: string | null | undefined;
}

const SIZE = 56;

export function StopThumb({ stopId, cityId, iso2, place, uri }: StopThumbProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const photo = uri != null && uri !== failedUri ? uri : null;
  return (
    <View
      testID={`stop-thumb-${stopId}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.frame}>
      {photo !== null ? (
        <Image
          testID={`stop-thumb-${stopId}-photo`}
          source={{ uri: photo }}
          recyclingKey={String(cityId)}
          contentFit="cover"
          transition={0}
          onError={() => setFailedUri(photo)}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <GeneratedCover
          testID={`stop-thumb-${stopId}-generated`}
          palette={coverPalette(String(cityId))}
          iso2={iso2}
          initial={place}
          thumb
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: SIZE, height: SIZE, overflow: 'hidden', ...cornerOf('lg') },
});
