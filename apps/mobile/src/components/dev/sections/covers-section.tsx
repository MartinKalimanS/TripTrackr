/**
 * Generated covers (feature 005, T524; contract C5-19, FR-008): the three palettes at the
 * size of a hero (about 16 to 10) and as the 40 dp thumbnail of a row. White type must hold
 * on both stops of each palette in every theme (a test measures it; this is where it is seen).
 */
import { View } from 'react-native';

import {
  GeneratedCover,
  coverPalette,
  type CoverPaletteIndex,
} from '@/components/ui/generated-cover';
import { Text } from '@/components/ui/text';

import { Labelled, Row, Section } from '../gallery-parts';

const PALETTES = [
  { palette: 0, iso2: 'JP', title: 'Kyoto in Spring' },
  { palette: 1, iso2: 'PT', title: 'Portugal Road Trip' },
  { palette: 2, iso2: 'IS', title: 'Iceland Ring Road' },
] as const satisfies readonly {
  palette: CoverPaletteIndex;
  iso2: string;
  title: string;
}[];

/** A trip id and the palette its hash picks: what a card with no photograph shows. */
const SEED = 'gallery-trip';

function Covers() {
  return (
    <View testID="gallery-covers-hero" className="gap-3">
      {PALETTES.map(({ palette, iso2, title }) => (
        <Labelled key={palette} label={`palette ${palette}`}>
          <View className="aspect-[16/10] overflow-hidden rounded-3xl">
            <GeneratedCover
              palette={palette}
              iso2={iso2}
              initial={title}
              testID={`gallery-cover-${palette}`}
            />
          </View>
        </Labelled>
      ))}
    </View>
  );
}

function Thumbs() {
  return (
    <Row label="thumb · the code only, 40 dp, and the first letter without a country">
      {PALETTES.map(({ palette, iso2, title }) => (
        <View key={palette} className="size-10 overflow-hidden rounded-xl">
          <GeneratedCover
            thumb
            palette={palette}
            iso2={iso2}
            initial={title}
            testID={`gallery-cover-thumb-${palette}`}
          />
        </View>
      ))}
      <View className="size-10 overflow-hidden rounded-xl">
        <GeneratedCover
          thumb
          palette={coverPalette(SEED)}
          iso2={null}
          initial="Weekend away"
          testID="gallery-cover-thumb-letter"
        />
      </View>
    </Row>
  );
}

export function CoversSection() {
  return (
    <Section
      id="covers"
      title="Generated covers"
      note="What a trip with no photograph wears. Palette by the hash of its id.">
      <Covers />
      <Thumbs />
      <Text variant="caption" tone="muted">
        {`The id "${SEED}" hashes to palette ${coverPalette(SEED)}.`}
      </Text>
    </Section>
  );
}
