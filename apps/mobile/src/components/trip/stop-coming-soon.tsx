/**
 * The two fields of the stop editor that the pictures draw and the app cannot keep
 * (feature 005, UI-SPEC 9.1 and 10; owner answer Q-11): "Getting there" and "Note". A stop
 * has no transport and no note on the wire or in the store, so both are COMING-SOON
 * controls: drawn as pictured, real buttons, hinted "Not available yet", and a press shows
 * the one "<Thing> is coming soon" toast and does nothing else. Neither is an input, neither
 * holds a value, nothing is saved, and no sample text or default choice is invented: no chip
 * is selected, and the note box shows an invitation, not the picture's example.
 *
 * Ids follow `coming-soon-<name>`: `coming-soon-stop-mode-car|train|plane|walk` and
 * `coming-soon-stop-note`. Neither reads a store, a router or the network (a test pins it).
 * "Getting there" is one sideways row (no scroll bar) that keeps taps with the keyboard up;
 * the right fade of the picture is not drawn (only `Scrim` may draw a gradient; device check).
 */
import { ScrollView, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { COMING_SOON_HINT, useComingSoon } from '@/components/ui/coming-soon-button';
import { fieldMinHeight } from '@/components/ui/field';
import { type IconName } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import { useFontScale } from '@/hooks/use-font-scale';
import { Space, cornerOf } from '@/theme';

import { StopFieldLabel } from './stop-field-label';

type Mode = { name: string; label: string; icon: IconName };

const MODES: readonly Mode[] = [
  { name: 'car', label: 'Car', icon: 'car' },
  { name: 'train', label: 'Train', icon: 'tram' },
  { name: 'plane', label: 'Plane', icon: 'plane' },
  { name: 'walk', label: 'Walk', icon: 'footprints' },
];

/** The "Getting there" label and its sideways row of transport chips. */
export function GettingThere() {
  const soon = useComingSoon('Getting there');

  return (
    <View testID="stop-getting-there" className="gap-2">
      <StopFieldLabel optional>Getting there</StopFieldLabel>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Getting there"
        contentContainerStyle={{ gap: Space[2] }}>
        {MODES.map((mode) => (
          <Chip
            key={mode.name}
            testID={`coming-soon-stop-mode-${mode.name}`}
            label={mode.label}
            leading={mode.icon}
            accessibilityLabel={mode.label}
            accessibilityHint={COMING_SOON_HINT}
            onPress={soon}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const COLOR_KEYS = ['border'] as const;
const NOTE_LINES = 3;

/** The "Note" label and the text-area-shaped box that answers with the toast. */
export function StopNote() {
  const soon = useComingSoon('Stop notes');
  const fontScale = useFontScale();
  const colors = useColors(COLOR_KEYS);

  return (
    <View testID="stop-note" className="gap-2">
      <StopFieldLabel optional>Note</StopFieldLabel>
      <Tappable
        testID="coming-soon-stop-note"
        accessibilityLabel="Note"
        accessibilityHint={COMING_SOON_HINT}
        onPress={soon}
        className="bg-field"
        style={[
          cornerOf('md'),
          {
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            minHeight: fieldMinHeight(fontScale, NOTE_LINES),
            paddingVertical: Space[3],
            paddingHorizontal: Space[4],
            borderWidth: 1,
            borderColor: colors.border,
          },
        ]}>
        <Text tone="muted">Add a note</Text>
      </Tappable>
    </View>
  );
}
