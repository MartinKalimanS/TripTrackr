/**
 * What a stored document says about itself — tasks.md T118; restyled for Atlas by 004 T443 and
 * drawn as the picture's one cream group by 005 T552 (contract C4-10; FR-005, FR-025, FR-029,
 * FR-030, FR-034, FR-037, FR-050; feature 002 FR-010; Constitution II, IV).
 *
 * Three blocks, each in words rather than by colour or icon alone (`DocumentInfoGroup`: label
 * over value, hairlines between, no card inside a card):
 *
 *  - `DocumentFields`, for a boarding pass: the flight number, day and passenger name as
 *    label-and-value pairs, headed by whether they are confirmed. Extracted fields the
 *    traveller has not confirmed read "Check these details" — a proposal, never a fact
 *    (Constitution IV) — and the one control, a SECONDARY button (the screen has no primary
 *    while it is only being looked at), leads to the form.
 *  - The "Added" row, for every document: the day it was added, with the cloud tick once its
 *    bytes have reached the account (nothing that has not is dressed as saved).
 *  - `DocumentUploadStatus`, for every document: whether its bytes have reached the
 *    traveller's account, as the sync badge (icon and words) and a sentence (Constitution II,
 *    FR-041); a document the API refused as too large says so and says it stays on this device.
 *
 * The pictured "Reference" (with a copy control) and "Linked to" rows are NOT drawn: the data has
 * no reference or stop link, and a copy control would export a document's value (FR-032).
 *
 * Both show a passenger's name and a pass's state, so they block screen capture (FR-034).
 * The group is only a container: no id, name or order of its controls changed.
 *
 * Visibility posture: owner-only. Nothing here offers to share or export.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Text } from '@/components/ui/text';
import type { DocumentRow } from '@/db/schema';
import {
  FIELDS_STATUS_TEXT,
  UPLOAD_STATUS_TEXT,
  fieldsStatus,
  syncBadgeState,
  uploadStatus,
  type FieldsStatus,
} from '@/features/documents/document-copy';
import { useScreenCaptureGuard } from '@/features/documents/use-screen-capture-guard';
import { formatIsoDate, toIsoDate } from '@/features/trips/stop-dates';
import { Space, cornerOf } from '@/theme';

type FieldRowProps = { label: string; value: string; testID: string };

/** One section of the group: 16 dp round it, 12 dp between its parts. */
const SECTION = { padding: Space[4], gap: Space[3] } as const;

/** A small label over its value, which wraps at the largest text size. */
function FieldRow({ label, value, testID }: FieldRowProps) {
  return (
    <View className="gap-0.5">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="callout" testID={testID}>
        {value}
      </Text>
    </View>
  );
}

/** The button that opens the form, worded for what it will do. */
const REVIEW_LABEL: Readonly<Record<FieldsStatus, string>> = {
  unconfirmed: 'Check details',
  confirmed: 'Correct details',
  none: 'Enter flight details',
};

export type DocumentFieldsProps = {
  document: DocumentRow;
  onReview: () => void;
};

/** The pass's fields, as one section of the group: status, the three pairs, the control. */
export function DocumentFields({ document, onReview }: DocumentFieldsProps) {
  useScreenCaptureGuard();
  const status = fieldsStatus(document);
  if (status === null) return null;
  const fields = document.parsed_json;

  return (
    <View testID="document-details" className="items-start" style={SECTION}>
      <Text testID="document-fields-status" variant="headline">
        {FIELDS_STATUS_TEXT[status]}
      </Text>
      {fields ? (
        <View className="gap-3 self-stretch">
          <FieldRow
            label="Flight"
            value={fields.flight_number}
            testID="document-field-flight-number"
          />
          <FieldRow
            label="Date"
            value={formatIsoDate(fields.flight_date)}
            testID="document-field-flight-date"
          />
          <FieldRow
            label="Passenger"
            value={fields.passenger_name}
            testID="document-field-passenger-name"
          />
        </View>
      ) : null}
      <Button
        testID="document-review"
        variant="secondary"
        accessibilityLabel={REVIEW_LABEL[status]}
        onPress={onReview}>
        {REVIEW_LABEL[status]}
      </Button>
    </View>
  );
}

/** The day the document was added, in the traveller's own calendar. */
export function addedOn(document: Pick<DocumentRow, 'created_at'>): string {
  return formatIsoDate(toIsoDate(new Date(document.created_at)));
}

function AddedRow({ document }: { document: DocumentRow }) {
  const saved = syncBadgeState(document) === null;
  return (
    <View testID="document-added" className="flex-row items-center" style={SECTION}>
      <View className="flex-1 gap-0.5">
        <Text variant="caption" tone="muted">
          Added
        </Text>
        <Text variant="callout" testID="document-added-on">
          {addedOn(document)}
        </Text>
      </View>
      {saved ? (
        <Icon
          testID="document-added-uploaded"
          name="cloud-check"
          size={20}
          tone="success"
        />
      ) : null}
    </View>
  );
}

/** Hairline between the sections of the group (the group's own edge draws the outside). */
function Divider() {
  return <View className="bg-separator" style={{ height: 1 }} />;
}

export type DocumentInfoGroupProps = {
  document: DocumentRow;
  /** The pass's fields section; off while the confirmation form is open above. */
  showFields: boolean;
  onReview: () => void;
};

/** The picture's cream group: the pass's fields (when shown) and the Added row. */
export function DocumentInfoGroup({
  document,
  showFields,
  onReview,
}: DocumentInfoGroupProps) {
  useScreenCaptureGuard();
  const sections: ReactNode[] = [];
  if (showFields && fieldsStatus(document) !== null) {
    sections.push(
      <DocumentFields key="fields" document={document} onReview={onReview} />,
    );
  }
  sections.push(<AddedRow key="added" document={document} />);

  return (
    <View
      testID="document-info"
      className="border border-separator bg-surface-secondary"
      style={[cornerOf('xl'), { overflow: 'hidden' }]}>
      {sections.flatMap((section, index) =>
        index === 0 ? [section] : [<Divider key={`divider-${index}`} />, section],
      )}
    </View>
  );
}

export function DocumentUploadStatus({ document }: { document: DocumentRow }) {
  const badge = syncBadgeState(document);

  return (
    <View className="items-start gap-2">
      {badge ? <SyncBadge state={badge} /> : null}
      <Text testID="document-upload-status" variant="callout" tone="muted">
        {UPLOAD_STATUS_TEXT[uploadStatus(document)]}
      </Text>
    </View>
  );
}
