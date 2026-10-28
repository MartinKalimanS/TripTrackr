/**
 * One document in the trip's list — tasks.md T118; restyled for Atlas by 004 T443 and drawn as a
 * ticket by 005 T552 (FR-049, FR-050; contract C4-10, C4-11; FR-030, FR-034; feature 002 FR-010;
 * Constitution II, IV).
 *
 * This maps a stored document to the presentational `DocumentTicket`: the title is the kind of
 * document in the app's words, the line is the flight and its day for a boarding pass whose
 * fields are known, then whether those fields are confirmed or still to be checked (a
 * proposal is never dressed as fact), and whether its bytes have reached the account: the
 * pending-sync badge until they have and, for a document the API refused as too large, why.
 * The date stub is a real date (`ticketModel`). The row shows no picture and no passenger
 * name: a list is glanced at over a shoulder, and the document blocks capture once opened.
 *
 * What a screen reader says for the row is one sentence (`spoken`): the kind, the flight, the
 * field state, the badge's meaning and which date the stub shows.
 *
 * Visibility posture: owner-only. A row has no control but "open".
 */
import { View } from 'react-native';

import { SyncBadge, type SyncState } from '@/components/ui/sync-badge';
import { Text } from '@/components/ui/text';
import type { DocumentRow } from '@/db/schema';
import {
  FIELDS_STATUS_TEXT,
  UPLOAD_STATUS_TEXT,
  fieldsStatus,
  syncBadgeState,
  uploadStatus,
} from '@/features/documents/document-copy';
import { ticketModel } from '@/features/documents/document-ticket';

import { DocumentTicket } from './document-ticket';

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
  const model = ticketModel(document);
  const status = fieldsStatus(document);
  const badge = syncBadgeState(document);
  const failed = uploadStatus(document) === 'failed';

  const spoken = [
    model.title,
    model.line,
    status ? FIELDS_STATUS_TEXT[status] : null,
    badge ? SYNC_SPOKEN[badge] : null,
    model.stub.spoken,
  ]
    .filter((part) => part !== null)
    .join('. ');

  return (
    <DocumentTicket
      id={id}
      kind={model.kind}
      title={model.title}
      line={model.line}
      stub={model.stub}
      pending={badge !== null}
      spoken={spoken}
      onPress={onOpen}>
      {status ? (
        <Text variant="caption" tone="muted" testID={`document-fields-status-${id}`}>
          {FIELDS_STATUS_TEXT[status]}
        </Text>
      ) : null}
      {badge ? (
        <View className="items-start">
          <SyncBadge state={badge} />
        </View>
      ) : null}
      {failed ? (
        <Text variant="callout" tone="danger" testID={`document-upload-${id}`}>
          {UPLOAD_STATUS_TEXT.failed}
        </Text>
      ) : null}
    </DocumentTicket>
  );
}
