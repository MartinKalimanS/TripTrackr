/**
 * What a ticket in the documents list says (feature 005, T552; FR-049, FR-050; UI-SPEC 9.2;
 * picture `more/documents`): the kind icon, the title, one line, and the date stub.
 *
 * The data has THREE document types (boarding pass, booking, other), so a ticket is drawn
 * from them only (owner decision Q-11): the title is the kind in the app's own words, the line
 * is the flight (`AC834 · 22 Nov 2026`) for a pass whose fields are known, never a passenger
 * name (a list is glanced at over a shoulder). The stub is a real date and never a proposal
 * dressed as fact: a pass whose fields the traveller has CONFIRMED shows its flight date,
 * everything else shows the day it was added. No `Intl.PluralRules` (Hermes).
 */
import type { DocumentType } from '@triptrackr/contracts';

import type { IconName } from '@/components/ui/icon';
import type { DocumentRow } from '@/db/schema';
import {
  DOCUMENT_TYPE_LABELS,
  fieldsStatus,
  flightSummary,
} from '@/features/documents/document-copy';
import { formatIsoDate, fromIsoDate, toIsoDate } from '@/features/trips/stop-dates';

/** The glyph of each real kind (UI-SPEC 9.2: pass, booking, other). */
export const KIND_ICON: Readonly<Record<DocumentType, IconName>> = {
  boarding_pass: 'plane',
  booking: 'bed',
  other: 'file-text',
};

/** "1 document", "5 documents". */
export function documentCount(count: number): string {
  return `${count} ${count === 1 ? 'document' : 'documents'}`;
}

/** "Portugal Road Trip · 5 documents"; either half alone when the other is unknown. */
export function documentsSubtitle(
  tripTitle: string | null,
  count: number | null,
): string | null {
  const parts = [tripTitle, count === null ? null : documentCount(count)];
  return parts.filter((part): part is string => !!part).join(' · ') || null;
}

export interface TicketStub {
  /** The day of the month, "19". */
  day: string;
  /** The short month, "Oct". */
  month: string;
  /** Which date it is, so a screen reader and a test can tell them apart. */
  source: 'flight' | 'added';
  /** "Flight date 19 Oct 2026" or "Added 9 Oct 2026". */
  spoken: string;
}

export interface TicketModel {
  kind: DocumentType;
  title: string;
  line: string | null;
  stub: TicketStub;
}

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short' });

function stubOf(iso: string, source: TicketStub['source']): TicketStub {
  const when = fromIsoDate(iso);
  return {
    day: String(when.getDate()),
    month: monthFormatter.format(when),
    source,
    spoken: `${source === 'flight' ? 'Flight date' : 'Added'} ${formatIsoDate(iso)}`,
  };
}

export function ticketModel(document: DocumentRow): TicketModel {
  const fields = document.parsed_json;
  const confirmed = fieldsStatus(document) === 'confirmed' && fields !== null;
  const stub = confirmed
    ? stubOf(fields.flight_date, 'flight')
    : stubOf(toIsoDate(new Date(document.created_at)), 'added');
  return {
    kind: document.type,
    title: DOCUMENT_TYPE_LABELS[document.type],
    line: fields ? flightSummary(fields) : null,
    stub,
  };
}
