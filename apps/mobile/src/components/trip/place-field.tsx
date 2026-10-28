/**
 * The chosen place of the stop editor as pictured (feature 005, UI-SPEC 9.1): the cream field
 * with the country's flag chip, the city in bold and ", Country" after it in the regular
 * weight, and a round clear button at the end (a 28 dp sand disc with a cross).
 *
 * The ids and names are the editor's old ones: `stop-editor-place` is the words (a test reads
 * the city and the country from it), `stop-editor-change-city` is the clear button, named
 * "Change city" (the app's words win over the picture's "Clear place"); pressing it returns
 * to the picker. The disc is 28 dp but the target is the platform floor, with the disc
 * pulled to the field's padding. While editing an existing stop the city cannot change (a
 * move is a remove-and-add), so there is no flag (the stop carries no country) and no button.
 * The box grows with the text size (FR-029) and the words wrap.
 */
import { View } from 'react-native';

import { FlagChip } from '@/components/ui/flag-chip';
import { fieldMinHeight } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import { useFontScale } from '@/hooks/use-font-scale';
import { Space, cornerOf } from '@/theme';

export type PlaceFieldProps = {
  name: string;
  country?: string;
  /** The country's ISO alpha-2 code, for the flag. */
  iso?: string;
  /** Present while the city can still be changed (adding a stop). */
  onClear?: () => void;
};

const COLOR_KEYS = ['border', 'sand'] as const;
const DISC = 28;
const SLOP = Space[2];

export function PlaceField({ name, country, iso, onClear }: PlaceFieldProps) {
  const fontScale = useFontScale();
  const colors = useColors(COLOR_KEYS);
  const spoken = country ? `${name}, ${country}` : name;

  return (
    <View
      testID="stop-editor-place-field"
      className="bg-field"
      style={[
        cornerOf('md'),
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space[3],
          minHeight: fieldMinHeight(fontScale),
          paddingVertical: Space[2],
          paddingHorizontal: Space[4],
          borderWidth: 1,
          borderColor: colors.border,
        },
      ]}>
      {iso ? <FlagChip iso2={iso} size="lg" testID="stop-editor-place-flag" /> : null}
      <Text
        testID="stop-editor-place"
        variant="callout"
        accessibilityLabel={spoken}
        style={{ flexShrink: 1, flexGrow: 1 }}>
        {name}
        {country ? <Text variant="body" tone="muted">{`, ${country}`}</Text> : null}
      </Text>
      {onClear ? (
        <Tappable
          testID="stop-editor-change-city"
          accessibilityLabel="Change city"
          onPress={onClear}
          style={[
            cornerOf('full'),
            { alignItems: 'center', marginRight: -SLOP, marginVertical: -SLOP },
          ]}>
          <View
            style={[
              cornerOf('full'),
              {
                width: DISC,
                height: DISC,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.sand,
              },
            ]}>
            <Icon name="x" size={16} />
          </View>
        </Tappable>
      ) : null}
    </View>
  );
}
