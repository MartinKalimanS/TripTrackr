/**
 * One document in the trip's list — tasks.md T118; restyled for Atlas by 004 T443
 * (contract C4-10, C4-11; FR-015, FR-024, FR-025, FR-030, FR-034, FR-037; feature 002
 * FR-010; Constitution II, IV).
 *
 * The whole row opens the document: ONE `Card` control (role button, the hint "Opens the
 * document", a chevron cue). It leads with an icon for the kind of document and says, in
 * words, what the document is; for a boarding pass whose fields are known, the flight and
 * its day; whether those fields are confirmed or still to be checked (a proposal is never
 * dressed as fact); and whether its bytes have reached the account — the pending-sync badge
 * until they have, and, for a document the API refused as too large, why. A document that
 * is only on this device also has the card's dashed edge (a shape, never the only signal:
 * the badge and the words say it). The row shows no picture and no passenger name: a list
 * is glanced at over a shoulder, and the document blocks capture once opened.
 *
 * What a screen reader says for the row is one sentence (`spoken`), exactly as before: the
 * kind, the flight, the field state and the badge's meaning.
 *
 * Visibility posture: owner-only. A row has no control but "open".
 */
import type { DocumentType } from '@triptrackr/contracts';
import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { SyncBadge, type SyncState } from '@/components/ui/sync-badge';
import { Text } from '@/components/ui/text';
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

/** The glyph of each kind, on both platforms. */
const KIND_ICON: Readonly<Record<DocumentType, IconName>> = {
  boarding_pass: 'plane',
  booking: 'ticket',
  other: 'file-text',
};

/** A row of inline items that wraps under large text instead of clipping. */
const WRAP_ROW = 'flex-row flex-wrap items-center gap-x-2 gap-y-1';

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
    <Card
      testID={`document-row-${id}`}
      accessibilityLabel={spoken}
      accessibilityHint="Opens the document"
      pending={badge !== null}
      onPress={onOpen}>
      <View className="flex-row items-start gap-3">
        <Icon
          testID={`document-row-${id}-icon`}
          name={KIND_ICON[document.type]}
          size={24}
        />
        <View className="flex-1 gap-1">
          <View className={WRAP_ROW}>
            <Text type="headline">{label}</Text>
            {badge ? <SyncBadge state={badge} /> : null}
          </View>
          {fields ? (
            <Text type="numeric" context="callout" testID={`document-flight-${id}`}>
              {flightSummary(fields)}
            </Text>
          ) : null}
          {status ? (
            <Text type="callout" tone="muted" testID={`document-fields-status-${id}`}>
              {FIELDS_STATUS_TEXT[status]}
            </Text>
          ) : null}
          {failed ? (
            <Text type="callout" tone="danger" testID={`document-upload-${id}`}>
              {UPLOAD_STATUS_TEXT.failed}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
