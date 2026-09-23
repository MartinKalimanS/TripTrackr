/**
 * Add / edit a stop — tasks.md T068, T069 (FR-010, FR-011, FR-015).
 *
 * A React Native `Modal` rather than a router modal: the sheet is a
 * self-contained form that never needs a URL of its own
 * (https://docs.expo.dev/router/advanced/modals.md, "React Native's Modal
 * component"). Adding a stop picks a city (T067) and two dates; editing an
 * existing stop changes only its dates — moving a stop to another city is a
 * remove-and-add, which keeps the row's history honest.
 *
 * Dates: arrival is pre-suggested from the previous stop's departure
 * (FR-015); departure defaults to the next day; moving the arrival past the
 * departure drags the departure along so the pair stays valid. A departure
 * before the arrival is refused in words (FR-011, Acceptance Scenario 1.8).
 */
import type { City, Country } from '@triptrackr/contracts';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CityPicker } from '@/components/trip/city-picker';
import { DateField } from '@/components/trip/date-field';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Surface } from '@/components/ui/surface';
import { Spacing } from '@/constants/theme';
import {
  suggestArrival,
  suggestDeparture,
  validateStopDates,
} from '@/features/trips/stop-dates';

export type StopEditorValues = {
  city_id: number;
  arrive_date: string;
  depart_date: string;
};

export type StopEditorMode =
  | { kind: 'add'; previousStop: { depart_date: string } | null }
  | {
      kind: 'edit';
      stop: { city_id: number; arrive_date: string; depart_date: string };
      placeName: string;
    };

export type StopEditorProps = {
  visible: boolean;
  mode: StopEditorMode;
  onCancel: () => void;
  onSubmit: (values: StopEditorValues) => void;
};

type Place = { city: City; country: Country };

function initialDates(mode: StopEditorMode): { arrive: string; depart: string } {
  if (mode.kind === 'edit') {
    return { arrive: mode.stop.arrive_date, depart: mode.stop.depart_date };
  }
  const arrive = suggestArrival(mode.previousStop);
  return { arrive, depart: suggestDeparture(arrive) };
}

function StopEditorForm({ mode, onCancel, onSubmit }: Omit<StopEditorProps, 'visible'>) {
  const [place, setPlace] = useState<Place | null>(null);
  const [{ arrive, depart }, setDates] = useState(() => initialDates(mode));

  const cityId = mode.kind === 'edit' ? mode.stop.city_id : (place?.city.id ?? null);
  const dateError = validateStopDates(arrive, depart);
  const canSave = cityId !== null && dateError === null;

  const changeArrival = (next: string) => {
    setDates((current) => ({
      arrive: next,
      depart: current.depart < next ? next : current.depart,
    }));
  };

  const submit = () => {
    if (cityId === null || dateError !== null) return;
    onSubmit({ city_id: cityId, arrive_date: arrive, depart_date: depart });
  };

  return (
    <View style={styles.form}>
      <ThemedText type="subtitle">
        {mode.kind === 'add' ? 'Add stop' : 'Edit dates'}
      </ThemedText>

      {mode.kind === 'edit' ? (
        <ThemedText testID="stop-editor-place">{mode.placeName}</ThemedText>
      ) : place ? (
        <Surface treatment="recessed" radius="md" style={styles.chosen}>
          <View style={styles.chosenText}>
            <ThemedText type="smallBold" testID="stop-editor-place">
              {place.city.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted">
              {place.country.name}
            </ThemedText>
          </View>
          <PressableSurface
            testID="stop-editor-change-city"
            accessibilityLabel="Change city"
            treatment="flat"
            onPress={() => setPlace(null)}
            style={styles.inlineAction}>
            <ThemedText type="smallBold">Change</ThemedText>
          </PressableSurface>
        </Surface>
      ) : (
        <CityPicker onSelect={(city, country) => setPlace({ city, country })} />
      )}

      {mode.kind === 'edit' || place ? (
        <>
          <DateField
            testID="stop-editor-arrive"
            label="Arrival"
            value={arrive}
            onChange={changeArrival}
          />
          <DateField
            testID="stop-editor-depart"
            label="Departure"
            value={depart}
            minimumDate={arrive}
            onChange={(next) => setDates((current) => ({ ...current, depart: next }))}
            error={dateError ?? undefined}
          />
        </>
      ) : null}

      <View style={styles.actions}>
        <PressableSurface
          testID="stop-editor-cancel"
          accessibilityLabel="Cancel"
          treatment="flat"
          onPress={onCancel}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Cancel
          </ThemedText>
        </PressableSurface>
        <PressableSurface
          testID="stop-editor-save"
          accessibilityLabel={mode.kind === 'add' ? 'Save stop' : 'Save dates'}
          depth={2}
          disabled={!canSave}
          onPress={submit}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            {mode.kind === 'add' ? 'Save stop' : 'Save dates'}
          </ThemedText>
        </PressableSurface>
      </View>
    </View>
  );
}

export function StopEditor({ visible, mode, onCancel, onSubmit }: StopEditorProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}>
      <ThemedView type="canvas" style={styles.sheet} testID="stop-editor">
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <SafeAreaView edges={['bottom']}>
            {/* Remount per opening so a cancelled draft does not linger. */}
            {visible ? (
              <StopEditorForm mode={mode} onCancel={onCancel} onSubmit={onSubmit} />
            ) : null}
          </SafeAreaView>
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  scroll: { flexGrow: 1, padding: Spacing.four },
  form: { gap: Spacing.three },
  chosen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chosenText: { flex: 1, gap: Spacing.half },
  inlineAction: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  centred: { textAlign: 'center' },
});
