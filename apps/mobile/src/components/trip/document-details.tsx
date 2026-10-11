/**
 * What a stored document says about itself — tasks.md T118; restyled for Atlas by 004 T443
 * (contract C4-10; FR-005, FR-025, FR-029, FR-030, FR-034, FR-037; feature 002 FR-010;
 * Constitution II, IV).
 *
 * Two blocks, each in words rather than by colour or icon alone:
 *
 *  - `DocumentFields`, for a boarding pass: one card with the flight number, day and
 *    passenger name as label-and-value pairs, headed by whether they are confirmed.
 *    Extracted fields the traveller has not confirmed read "Check these details" — a
 *    proposal, never a fact (Constitution IV) — and the one control, a SECONDARY button
 *    (the screen has no primary while it is only being looked at), leads to the form.
 *  - `DocumentUploadStatus`, for every document: whether its bytes have reached the
 *    traveller's account, as the sync badge (icon and words) and a sentence. Nothing that
 *    has not is presented as saved (Constitution II, FR-041), and a document the API
 *    refused as too large says so and says it stays on this device.
 *
 * Both show a passenger's name and a pass's state, so they block screen capture (FR-034).
 * The card is only a container: no id, name or order of its controls changed.
 *
 * Visibility posture: owner-only. Nothing here offers to share or export.
 */
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { formatIsoDate } from '@/features/trips/stop-dates';

type FieldRowProps = { label: string; value: string; testID: string };

/** A small label over its value, which wraps at the largest text size. */
function FieldRow({ label, value, testID }: FieldRowProps) {
  return (
    <View className="gap-0.5">
      <Text type="caption" tone="muted">
        {label}
      </Text>
      <Text type="body" testID={testID}>
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

export function DocumentFields({ document, onReview }: DocumentFieldsProps) {
  useScreenCaptureGuard();
  const status = fieldsStatus(document);
  if (status === null) return null;
  const fields = document.parsed_json;

  return (
    <Card testID="document-details">
      <View className="items-start gap-3">
        <Text testID="document-fields-status" type="headline">
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
    </Card>
  );
}

export function DocumentUploadStatus({ document }: { document: DocumentRow }) {
  const badge = syncBadgeState(document);

  return (
    <View className="items-start gap-2">
      {badge ? <SyncBadge state={badge} /> : null}
      <Text testID="document-upload-status" type="callout" tone="muted">
        {UPLOAD_STATUS_TEXT[uploadStatus(document)]}
      </Text>
    </View>
  );
}
