/**
 * Stop dates — tasks.md T069 (FR-011, FR-015); research D-25.
 *
 * Calendar arithmetic on the wire's `IsoDate` strings (`YYYY-MM-DD`) through
 * `date-fns`. Everything works on the LOCAL calendar day: a traveller picking
 * "12 May" at 23:30 in Rome means 12 May, and a UTC conversion would quietly
 * turn it into 11 May. `parseISO` of a date-only string yields local midnight
 * and `formatISO` reads the local fields back, which is exactly that rule;
 * dates never carry a time, so there is nothing to lose by staying in
 * calendar space.
 */
import { tripStopDatesInOrder } from '@triptrackr/contracts';
import {
  addDays as addDaysTo,
  differenceInCalendarDays,
  formatISO,
  isValid,
  parseISO,
} from 'date-fns';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar day of `date` as `YYYY-MM-DD`. */
export function toIsoDate(date: Date): string {
  return formatISO(date, { representation: 'date' });
}

/** Local midnight of the given calendar day. */
export function fromIsoDate(iso: string): Date {
  return parseISO(iso);
}

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && isValid(fromIsoDate(value));
}

export function addDays(iso: string, days: number): string {
  return toIsoDate(addDaysTo(fromIsoDate(iso), days));
}

/**
 * Whole nights between two wire dates (local calendar days, so a daylight saving change
 * inside the stay cannot add or drop one). Negative when the departure is before the
 * arrival, which `validateStopDates` refuses. The Nights stepper shows this; nothing
 * stores it.
 */
export function nightsBetween(arrive: string, depart: string): number {
  return differenceInCalendarDays(fromIsoDate(depart), fromIsoDate(arrive));
}

/** The departure that is `nights` nights after `arrive`: the inverse of `nightsBetween`. */
export function departureAfterNights(arrive: string, nights: number): string {
  return addDays(arrive, nights);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/**
 * FR-015: the next stop begins where the previous one ended. With no previous
 * stop the trip has not started, so the suggestion is today.
 */
export function suggestArrival(
  previousStop: { depart_date: string } | null | undefined,
  today: string = todayIso(),
): string {
  return previousStop ? previousStop.depart_date : today;
}

/** A stop is somewhere you stay: default to one night. */
export function suggestDeparture(arrive: string): string {
  return addDays(arrive, 1);
}

export const STOP_DATE_MESSAGES = {
  arriveMissing: 'Choose an arrival date.',
  departMissing: 'Choose a departure date.',
  departBeforeArrive: 'Departure can’t be before arrival.',
} as const;

/**
 * FR-011, client side: the message to show, or `null` when the pair is valid.
 * The ordering rule is the wire schema's own predicate, so the form and the
 * server can never disagree about what "before" means.
 */
export function validateStopDates(arrive: string, depart: string): string | null {
  if (!isIsoDate(arrive)) return STOP_DATE_MESSAGES.arriveMissing;
  if (!isIsoDate(depart)) return STOP_DATE_MESSAGES.departMissing;
  if (!tripStopDatesInOrder.check({ arrive_date: arrive, depart_date: depart })) {
    return STOP_DATE_MESSAGES.departBeforeArrive;
  }
  return null;
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "12 May 2026" (locale-dependent order) for lists and headers. */
export function formatIsoDate(iso: string): string {
  return dayFormatter.format(fromIsoDate(iso));
}

const stopDayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const monthDayFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

/** "Thu 15 Oct" (locale-dependent order): the stop editor's date fields. */
export function formatStopDay(iso: string): string {
  return stopDayFormatter.format(fromIsoDate(iso));
}

/** "19 Oct": the day and month alone. */
export function formatStopMonthDay(iso: string): string {
  return monthDayFormatter.format(fromIsoDate(iso));
}
