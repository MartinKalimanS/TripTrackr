/**
 * Add / edit a stop — tasks.md T068, T069 (FR-010, FR-011, FR-015); a page sheet on the
 * form-sheet pattern since feature 004 (T437; contract C4-8, C4-10 rules 2, 5 and 8; FR-005,
 * FR-009, FR-024, FR-029, FR-030, FR-037; research D4-06).
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
 *
 * The Modal: `presentationStyle="pageSheet"` (iOS; Android has no such thing and shows a
 * full-screen dialog), `allowSwipeDismissal` so a swipe down on iOS dismisses it as Cancel
 * (RN 0.86: it fires `onRequestClose`, and without the prop the sheet cannot be swiped
 * away), and `onRequestClose` for that swipe and for Android's Back. With reduced motion it
 * does not slide in (the photo view's precedent, feature 002 FR-015). It takes no
 * `statusBarTranslucent` or `navigationBarTranslucent`: with edge-to-edge on (the Expo
 * default since SDK 54) react-native's Modal reports both bars translucent whatever the
 * props say (`ReactModalHostView`: `field || isEdgeToEdgeFeatureFlagOn`), so on Android the
 * content runs under the status bar and the frame pads it by the top inset. iOS needs no
 * padding: a page sheet starts below the status bar. It also draws no handle, so the frame
 * draws one (FR-009; decoration, hidden from assistive technology).
 *
 * The body is the shared `FormSheet` on the `modal` host: a title, a scrolling
 * keyboard-aware body (the city picker's list scrolls inside it; taps are kept with the
 * keyboard up) and a sticky footer, Cancel and Save, that rides up with the keyboard and so
 * is never under it (rule 8). Save is the one primary of every state (FR-005); "Change
 * city" is a secondary button. The ids and names are unchanged: `stop-editor` (the sheet),
 * `stop-editor-place`, `stop-editor-change-city` ("Change city"), `stop-editor-arrive`,
 * `stop-editor-depart`, `stop-editor-cancel`, `stop-editor-save`; the Modal, the frame and
 * the handle are new, additive ids.
 *
 * There is no save error to show here: the write happens after the sheet closes, in the
 * trip screen, which reports a failure as its own `trip-write-error` alert (T431).
 *
 * UNVERIFIED ON A DEVICE (tasks.md T437): the page sheet and the swipe on iOS, the handle
 * beside the system's own, the sticky footer inside a page sheet (the keyboard library
 * reports in its discussion 867 that it does not follow a sheet that is dragged), the
 * footer on the keyboard and the top inset on Android, and the largest text size.
 */
import type { City, Country } from '@triptrackr/contracts';
import { useContext, useState, type ReactNode } from 'react';
import { Modal, Platform, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { CityPicker } from '@/components/trip/city-picker';
import { DateField } from '@/components/trip/date-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormSheet } from '@/components/ui/form-sheet';
import { Text } from '@/components/ui/text';
import {
  suggestArrival,
  suggestDeparture,
  validateStopDates,
} from '@/features/trips/stop-dates';
import { useAppearance } from '@/hooks/use-appearance';

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

function useStopEditorForm(mode: StopEditorMode, onSubmit: StopEditorProps['onSubmit']) {
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

  const changeDeparture = (next: string) =>
    setDates((current) => ({ ...current, depart: next }));

  const submit = () => {
    if (cityId === null || dateError !== null) return;
    onSubmit({ city_id: cityId, arrive_date: arrive, depart_date: depart });
  };

  return {
    place,
    setPlace,
    arrive,
    depart,
    dateError,
    canSave,
    changeArrival,
    changeDeparture,
    submit,
  };
}

type PlaceCardProps = {
  name: string;
  country?: string;
  /** Present while the city can still be changed (adding a stop). */
  onChangeCity?: () => void;
};

/** The city of the stop: its name, its country beneath, and a way to pick another. */
function PlaceCard({ name, country, onChangeCity }: PlaceCardProps) {
  return (
    <Card variant="flat">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <View className="shrink grow gap-1">
          <Text type="headline" testID="stop-editor-place">
            {name}
          </Text>
          {country ? (
            <Text type="callout" tone="muted">
              {country}
            </Text>
          ) : null}
        </View>
        {onChangeCity ? (
          <Button
            testID="stop-editor-change-city"
            variant="secondary"
            size="sm"
            accessibilityLabel="Change city"
            onPress={onChangeCity}>
            Change
          </Button>
        ) : null}
      </View>
    </Card>
  );
}

type PlaceSectionProps = {
  mode: StopEditorMode;
  place: Place | null;
  onChange: (place: Place | null) => void;
};

function PlaceSection({ mode, place, onChange }: PlaceSectionProps) {
  if (mode.kind === 'edit') return <PlaceCard name={mode.placeName} />;
  if (!place) {
    return <CityPicker onSelect={(city, country) => onChange({ city, country })} />;
  }
  return (
    <PlaceCard
      name={place.city.name}
      country={place.country.name}
      onChangeCity={() => onChange(null)}
    />
  );
}

type StopDatesProps = {
  arrive: string;
  depart: string;
  error: string | null;
  onArrive: (next: string) => void;
  onDepart: (next: string) => void;
};

function StopDates({ arrive, depart, error, onArrive, onDepart }: StopDatesProps) {
  return (
    <>
      <DateField
        testID="stop-editor-arrive"
        label="Arrival"
        value={arrive}
        onChange={onArrive}
      />
      <DateField
        testID="stop-editor-depart"
        label="Departure"
        value={depart}
        minimumDate={arrive}
        onChange={onDepart}
        error={error ?? undefined}
      />
    </>
  );
}

function StopEditorForm({ mode, onCancel, onSubmit }: Omit<StopEditorProps, 'visible'>) {
  const form = useStopEditorForm(mode, onSubmit);
  const adding = mode.kind === 'add';

  return (
    <FormSheet
      host="modal"
      testID="stop-editor"
      title={adding ? 'Add stop' : 'Edit dates'}
      actions={{
        testIDPrefix: 'stop-editor',
        saveLabel: adding ? 'Save stop' : 'Save dates',
        onCancel,
        onSave: form.submit,
        saveDisabled: !form.canSave,
      }}>
      <PlaceSection mode={mode} place={form.place} onChange={form.setPlace} />

      {mode.kind === 'edit' || form.place ? (
        <StopDates
          arrive={form.arrive}
          depart={form.depart}
          error={form.dateError}
          onArrive={form.changeArrival}
          onDepart={form.changeDeparture}
        />
      ) : null}
    </FormSheet>
  );
}

/** Where a page sheet has none of its own: decoration, so assistive technology skips it. */
function SheetHandle() {
  return (
    <View
      testID="stop-editor-handle"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="mt-3 h-1 w-8 self-center rounded-full bg-border"
    />
  );
}

/**
 * The Modal's content frame: the canvas, the handle on iOS, and on Android the room under
 * the status bar that the edge-to-edge Modal draws beneath (see the header). The platform
 * is read at render, and the insets from the context (0 with no provider above it).
 */
function Frame({ children }: { children: ReactNode }) {
  const insets = useContext(SafeAreaInsetsContext);
  const topInset = Platform.OS === 'android' ? (insets?.top ?? 0) : 0;

  return (
    <View
      testID="stop-editor-frame"
      className="flex-1 bg-background"
      style={{ paddingTop: topInset }}>
      {Platform.OS === 'ios' ? <SheetHandle /> : null}
      {children}
    </View>
  );
}

export function StopEditor({ visible, mode, onCancel, onSubmit }: StopEditorProps) {
  const { prefersLessMotion } = useAppearance();

  return (
    <Modal
      testID="stop-editor-modal"
      visible={visible}
      animationType={prefersLessMotion ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onCancel}>
      <Frame>
        {/* Remount per opening so a cancelled draft does not linger. */}
        {visible ? (
          <StopEditorForm mode={mode} onCancel={onCancel} onSubmit={onSubmit} />
        ) : null}
      </Frame>
    </Modal>
  );
}
