/**
 * A trip's travel documents — tasks.md T118, T119 (FR-031, FR-032, FR-034,
 * FR-035, FR-041; Constitution I, II); research D-23, D-32, D-33.
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
 * The list blocks screen capture (FR-034) and, like every document screen,
 * has no control that could share, export, copy or publish a document
 * (FR-032). `useFocusEffect` is expo-router's v57 hook.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { DocumentListItem } from '@/components/trip/document-list-item';
import { DocumentsHeader } from '@/components/trip/documents-header';
import { ListScreen } from '@/components/ui/list-screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
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

function DocumentsEmpty({ documents }: { documents: LiveResult<DocumentRow[]> }) {
  if (documents.error) {
    return (
      <ErrorState
        title="Couldn’t read the documents"
        detail="The local store did not answer."
      />
    );
  }
  if (documents.loading) return <LoadingState title="Loading documents" />;
  return (
    <EmptyState
      title="No documents yet"
      detail="Scan a boarding pass or photograph a booking. It’s kept on this device, encrypted, until it uploads."
    />
  );
}

export default function DocumentsScreen() {
  useScreenCaptureGuard();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const trip = useTrip(tripId);
  const documents = useDocuments(tripId);
  useRetryUploads(tripId);

  const header = (
    <DocumentsHeader
      tripTitle={trip.data?.title ?? null}
      onBack={() => router.back()}
      onAdd={() => router.push(`/trip/${tripId}/document-capture`)}
    />
  );

  return (
    <ListScreen
      testID="documents-screen"
      data={documents.data}
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
      empty={<DocumentsEmpty documents={documents} />}
    />
  );
}
