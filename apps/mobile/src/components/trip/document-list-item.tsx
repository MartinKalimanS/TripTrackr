/**
 * One document in the trip's list — tasks.md T118 (FR-031, FR-035, FR-041;
 * feature 002 FR-010; Constitution II, IV).
 *
 * The whole row opens the document. It says, in words, what the document is;
 * for a boarding pass whose fields are known, the flight and its day; whether
 * those fields are confirmed or still to be checked (a proposal is never
 * dressed as fact); and whether its bytes have reached the account — the
 * pending-sync badge until they have, and, for a document the API refused as
 * too large, why. The row shows no picture and no passenger name: a list is
 * glanced at over a shoulder, and the document blocks capture once opened.
 *
 * Visibility posture: owner-only. A row has no control but "open".
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { SyncBadge, type SyncState } from '@/components/ui/sync-badge';
import { Spacing } from '@/constants/theme';
import type { DocumentRow } from '@/db/schema';
import {
  DOCUMENT_TYPE_LABELS,
  FIELDS_STATUS_TEXT,
  UPLOAD_STATUS_TEXT,
  fieldsStatus,
  flightSummary,
  syncBadgeState,
  uploadStatus,
} from '@/features/documents/document-copy';

export type DocumentListItemProps = {
  document: DocumentRow;
  onOpen: () => void;
};

/** The badge's meaning as a screen reader says it, since the row reads as one label. */
const SYNC_SPOKEN: Readonly<Record<SyncState, string>> = {
  pending: 'Not yet synced',
  syncing: 'Syncing',
  failed: 'Sync failed',
};

export function DocumentListItem({ document, onOpen }: DocumentListItemProps) {
  const { id } = document;
  const label = DOCUMENT_TYPE_LABELS[document.type];
  const fields = document.parsed_json;
  const status = fieldsStatus(document);
  const badge = syncBadgeState(document);
  const failed = uploadStatus(document) === 'failed';

  const spoken = [
    label,
    fields ? flightSummary(fields) : null,
    status ? FIELDS_STATUS_TEXT[status] : null,
    badge ? SYNC_SPOKEN[badge] : null,
  ]
    .filter((part) => part !== null)
    .join('. ');

  return (
    <PressableSurface
      testID={`document-row-${id}`}
      accessibilityLabel={spoken}
      accessibilityHint="Opens the document"
      radius="lg"
      onPress={onOpen}
      style={styles.row}>
      <View style={styles.heading}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {badge ? <SyncBadge state={badge} /> : null}
      </View>
      {fields ? (
        <ThemedText testID={`document-flight-${id}`}>{flightSummary(fields)}</ThemedText>
      ) : null}
      {status ? (
        <ThemedText
          testID={`document-fields-status-${id}`}
          type="small"
          themeColor="textMuted">
          {FIELDS_STATUS_TEXT[status]}
        </ThemedText>
      ) : null}
      {failed ? (
        <ThemedText testID={`document-upload-${id}`} type="small" themeColor="danger">
          {UPLOAD_STATUS_TEXT.failed}
        </ThemedText>
      ) : null}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  row: { padding: Spacing.three, gap: Spacing.two, alignItems: 'flex-start' },
  heading: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
