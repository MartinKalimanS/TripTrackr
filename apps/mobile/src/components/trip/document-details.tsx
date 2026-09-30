/**
 * What a stored document says about itself — tasks.md T118 (FR-035, FR-041;
 * feature 002 FR-010; Constitution II, IV).
 *
 * Two blocks, each in words rather than by colour or icon alone:
 *
 *  - `DocumentFields`, for a boarding pass: the flight number, day and
 *    passenger name, headed by whether they are confirmed. Extracted fields
 *    the traveller has not confirmed read "Check these details" — a proposal,
 *    never a fact (Constitution IV) — and the one control leads to the form.
 *  - `DocumentUploadStatus`, for every document: whether its bytes have reached
 *    the traveller's account. Nothing that has not is presented as saved
 *    (Constitution II, FR-041), and a document the API refused as too large
 *    says so and says it stays on this device.
 *
 * Both show a passenger's name and a pass's state, so they block screen
 * capture (FR-034).
 *
 * Visibility posture: owner-only. Nothing here offers to share or export.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Spacing } from '@/constants/theme';
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

function FieldRow({ label, value, testID }: FieldRowProps) {
  return (
    <View style={styles.fieldRow}>
      <ThemedText type="small" themeColor="textMuted">
        {label}
      </ThemedText>
      <ThemedText testID={testID}>{value}</ThemedText>
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
    <View testID="document-details" style={styles.block}>
      <ThemedText testID="document-fields-status" type="smallBold">
        {FIELDS_STATUS_TEXT[status]}
      </ThemedText>
      {fields ? (
        <>
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
        </>
      ) : null}
      <PressableSurface
        testID="document-review"
        accessibilityLabel={REVIEW_LABEL[status]}
        depth={2}
        onPress={onReview}
        style={styles.action}>
        <ThemedText type="smallBold">{REVIEW_LABEL[status]}</ThemedText>
      </PressableSurface>
    </View>
  );
}

export function DocumentUploadStatus({ document }: { document: DocumentRow }) {
  const badge = syncBadgeState(document);

  return (
    <View style={styles.block}>
      {badge ? <SyncBadge state={badge} /> : null}
      <ThemedText testID="document-upload-status" type="small" themeColor="textMuted">
        {UPLOAD_STATUS_TEXT[uploadStatus(document)]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two, alignItems: 'flex-start' },
  fieldRow: { gap: Spacing.half },
  action: {
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
