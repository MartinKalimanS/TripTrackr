/**
 * A trip's travel documents — tasks.md T118, T119 (FR-031, FR-032, FR-034,
 * FR-035, FR-041; Constitution I, II); research D-23, D-32, D-33; restyled for Atlas by
 * 004 T443 (contract C4-10; FR-005, FR-007, FR-008, FR-015, FR-021, FR-035).
 *
 * Everything here is read from the encrypted local store; the list is a live
 * query, so a capture shows up the moment SQLite commits it, and it is a
 * `FlashList` through `ListScreen` (D-23) because a trip's documents are
 * unbounded. Each row says what the document is, whether its flight fields are
 * confirmed, and whether its bytes have reached the account. Gaining focus —
 * including the app returning to the foreground on this screen — retries
 * whatever the trip still owes the API (`syncTrip` never rejects and never
 * shows a dialog; the badge on the row is where a pending upload is told).
 *
 * Under a native header (`_layout.tsx`: "Documents" and Back), so the screen is
 * `underHeader` and has no bar of its own. Its states are designed: skeleton rows
 * while the store answers (never the empty state), an empty state that names the
 * next action, and an error that offers "Try again". A live query has nothing to
 * re-run in place, so the retry reads it afresh by mounting the reader again
 * (`key`); the capture guard lives one level above, so a retry never leaves the
 * screen unprotected.
 *
 * The list blocks screen capture (FR-034) and, like every document screen,
 * has no control that could share, export, copy or publish a document
 * (FR-032). `useFocusEffect` is expo-router's v57 hook.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { DocumentListItem } from '@/components/trip/document-list-item';
import { DocumentsHeader } from '@/components/trip/documents-header';
import { ListScreen } from '@/components/ui/list-screen';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/state-view';
import type { DocumentRow } from '@/db/schema';
import { useDocumentActions, useDocuments } from '@/features/documents/use-documents';
import { useScreenCaptureGuard } from '@/features/documents/use-screen-capture-guard';
import { useTrip, type LiveResult } from '@/features/trips/use-trips';
import { useAppActive } from '@/hooks/use-app-active';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Try the trip's pending uploads whenever this list is focused in the foreground. */
function useRetryUploads(tripId: string): void {
  const actions = useDocumentActions();
  const active = useAppActive();
  useFocusEffect(
    useCallback(() => {
      if (active) void actions.syncTrip(tripId);
    }, [actions, tripId, active]),
  );
}

type DocumentsEmptyProps = {
  documents: LiveResult<DocumentRow[]>;
  onRetry: () => void;
};

/**
 * What stands in for the rows. The error comes first, then the skeleton: a screen never
 * shows its empty state while its first read is still resolving (C4-10 rule 2).
 */
function DocumentsEmpty({ documents, onRetry }: DocumentsEmptyProps) {
  if (documents.error) {
    return (
      <ErrorState
        title="Couldn’t read the documents"
        detail="The local store did not answer."
        onRetry={onRetry}
      />
    );
  }
  if (documents.loading) {
    return <ListSkeleton variant="row" rows={3} label="Loading documents" />;
  }
  return (
    <EmptyState
      title="No documents yet"
      detail="Use “Add document” to scan a boarding pass or photograph a booking. It’s kept on this device, encrypted, until it uploads."
    />
  );
}

function DocumentsList({ onRetry }: { onRetry: () => void }) {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const trip = useTrip(tripId);
  const documents = useDocuments(tripId);
  useRetryUploads(tripId);

  const header = (
    <DocumentsHeader
      tripTitle={trip.data?.title ?? null}
      onAdd={() => router.push(`/trip/${tripId}/document-capture`)}
    />
  );

  return (
    <ListScreen
      testID="documents-screen"
      underHeader
      // A failed read leaves no rows: stale ones would pass for the traveller's documents.
      data={documents.error ? [] : documents.data}
      keyExtractor={(document) => document.id}
      renderItem={({ item }) => (
        <DocumentListItem
          document={item}
          onOpen={() =>
            router.push(`/trip/${tripId}/document-view?documentId=${item.id}`)
          }
        />
      )}
      header={header}
      empty={<DocumentsEmpty documents={documents} onRetry={onRetry} />}
    />
  );
}

export default function DocumentsScreen() {
  useScreenCaptureGuard();
  const [attempt, setAttempt] = useState(0);

  return <DocumentsList key={attempt} onRetry={() => setAttempt((count) => count + 1)} />;
}
