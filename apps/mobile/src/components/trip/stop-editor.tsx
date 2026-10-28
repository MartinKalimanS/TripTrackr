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
 * As pictured (feature 005 F6; UI-SPEC 9.1; `add-stop*.png`): a "Place" field (the flag, the
 * city in bold, ", Country", a clear button named "Change city"), under it the route preview
 * ("Stop 3 · 322 km from Sintra", real coordinates only), "Dates" as one cream block with a
 * Nights stepper derived from them, and, when adding, the "Getting there" chips and the
 * "Note" box, which are coming-soon controls (Q-11: a stop has neither). Save is the sticky
 * footer's. `stop-editor-place`, `-change-city`, `-arrive`, `-depart`, `-save` and the
 * picker's ids are unchanged; the date halves are named "Arrival" and "Departure" still.
 *
 * Dates: arrival is pre-suggested from the previous stop's departure
 * (FR-015); departure defaults to the next day; moving the arrival past the
 * departure drags the departure along so the pair stays valid. A departure
 * before the arrival is refused in words (FR-011, Acceptance Scenario 1.8).
 *
 * The Modal is the shared `FormModal` (`components/ui/form-modal.tsx`: page sheet, swipe down as
 * Cancel, no slide under reduced motion, the iOS handle and the Android top inset), with the
 * ids `stop-editor-modal`, `stop-editor-frame` and `stop-editor-handle`.
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
import { useState } from 'react';
import { View } from 'react-native';

import { CityPicker } from '@/components/trip/city-picker';
import { FormModal } from '@/components/ui/form-modal';
import { FormSheet } from '@/components/ui/form-sheet';
import {
  departureAfterNights,
  formatStopMonthDay,
  nightsBetween,
  suggestArrival,
  suggestDeparture,
  validateStopDates,
} from '@/features/trips/stop-dates';
import { planRoute, type RouteStop } from '@/features/trips/stop-route';
import { Space } from '@/theme';

import { NightsStepper } from './nights-stepper';
import { PlaceField } from './place-field';
import { RoutePreview } from './route-preview';
import { StopDatesBlock } from './stop-dates-block';
import { StopFieldLabel } from './stop-field-label';
import { GettingThere, StopNote } from './stop-coming-soon';

export type StopEditorValues = {
  city_id: number;
  arrive_date: string;
  depart_date: string;
};

export type StopEditorMode =
  | {
      kind: 'add';
      previousStop: { depart_date: string } | null;
      /** The trip's stops in order, for the route preview; absent draws no route. */
      previousStops?: readonly RouteStop[];
    }
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

  /** The stepper asks for a count; the departure is what moves, the arrival never does. */
  const changeNights = (nights: number) =>
    setDates((current) => ({
      ...current,
      depart: departureAfterNights(current.arrive, nights),
    }));

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
    changeNights,
    submit,
  };
}

type PlaceSectionProps = {
  mode: StopEditorMode;
  place: Place | null;
  onChange: (place: Place | null) => void;
};

/** The place: the picker until a city is chosen, then the field with the route under it. */
function PlaceSection({ mode, place, onChange }: PlaceSectionProps) {
  if (mode.kind === 'edit') {
    return (
      <View className="gap-2">
        <StopFieldLabel>Place</StopFieldLabel>
        <PlaceField name={mode.placeName} />
      </View>
    );
  }
  if (!place) {
    return <CityPicker onSelect={(city, country) => onChange({ city, country })} />;
  }
  const route = planRoute(mode.previousStops ?? [], {
    name: place.city.name,
    lat: place.city.lat,
    lng: place.city.lng,
  });
  return (
    <View className="gap-2">
      <StopFieldLabel>Place</StopFieldLabel>
      <PlaceField
        name={place.city.name}
        country={place.country.name}
        iso={place.country.iso_code}
        onClear={() => onChange(null)}
      />
      {route ? <RoutePreview route={route} /> : null}
    </View>
  );
}

type StopDatesProps = {
  form: ReturnType<typeof useStopEditorForm>;
};

/** "Dates": the two days in one block, then the nights they make. */
function StopDates({ form }: StopDatesProps) {
  return (
    <View className="gap-2">
      <StopFieldLabel>Dates</StopFieldLabel>
      <StopDatesBlock
        arrive={form.arrive}
        depart={form.depart}
        onArrive={form.changeArrival}
        onDepart={form.changeDeparture}
        error={form.dateError ?? undefined}
      />
      <NightsStepper
        nights={nightsBetween(form.arrive, form.depart)}
        endsOn={formatStopMonthDay(form.depart)}
        onChange={form.changeNights}
      />
    </View>
  );
}

function StopEditorForm({ mode, onCancel, onSubmit }: Omit<StopEditorProps, 'visible'>) {
  const form = useStopEditorForm(mode, onSubmit);
  const adding = mode.kind === 'add';
  const chosen = mode.kind === 'edit' || form.place !== null;

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
      <View style={{ gap: Space[5] }}>
        <PlaceSection mode={mode} place={form.place} onChange={form.setPlace} />
        {chosen ? <StopDates form={form} /> : null}
        {chosen && adding ? <GettingThere /> : null}
        {chosen && adding ? <StopNote /> : null}
      </View>
    </FormSheet>
  );
}

export function StopEditor({ visible, mode, onCancel, onSubmit }: StopEditorProps) {
  return (
    <FormModal testID="stop-editor" visible={visible} onRequestClose={onCancel}>
      {/* Remount per opening so a cancelled draft does not linger. */}
      {visible ? (
        <StopEditorForm mode={mode} onCancel={onCancel} onSubmit={onSubmit} />
      ) : null}
    </FormModal>
  );
}
