/**
 * One travel document — tasks.md T118, T119 (FR-031, FR-034, FR-035, FR-041;
 * Acceptance Scenarios 5.3, 5.4, 5.5); research D-32, D-33.
 *
 * The decrypted picture (in memory, never on disk), a boarding pass's flight
 * number, day and passenger name with whether the traveller has confirmed
 * them, whether its bytes have reached the account, and the one destructive
 * control, delete. A pass reaches this screen straight from a scan with
 * `review=1`, the form already open: fields read from the barcode to check, or
 * an empty form for manual entry — never an error. `Not now` keeps the fields
 * as an unconfirmed proposal (Constitution IV). Confirming stores them locally
 * first and never waits on the network (Constitution II).
 *
 * This screen blocks screen capture while a document is on it (FR-034), and
 * offers no way to share, export, copy or publish the document — there is no
 * such control anywhere in the product (FR-032, Acceptance 5.5).
 * `useLocalSearchParams` is expo-router's v57 hook for a screen's own params.
 */
import type { DocumentParsedFields } from '@triptrackr/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DocumentConfirmForm } from '@/components/trip/document-confirm-form';
import { DocumentFields, DocumentUploadStatus } from '@/components/trip/document-details';
import { DocumentImage } from '@/components/trip/document-image';
import { InlineError } from '@/components/ui/inline-error';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import type { DocumentRow } from '@/db/schema';
import {
  DOCUMENT_TYPE_LABELS,
  fieldsStatus,
  reviewIntro,
} from '@/features/documents/document-copy';
import { DOCUMENT_FORM_COPY } from '@/features/documents/document-form';
import { useDocument, useDocumentActions } from '@/features/documents/use-documents';
import { useScreenCaptureGuard } from '@/features/documents/use-screen-capture-guard';
import { useWriteAttempt } from '@/hooks/use-write-attempt';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const DELETE_FAILED = 'That document could not be deleted. Please try again.';

function confirmDelete(onDelete: () => void) {
  Alert.alert(
    'Delete this document?',
    'It’s removed from this device, and from your account once you’re online.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ],
  );
}

type OpenDocumentProps = {
  document: DocumentRow;
  /** Arrived straight from a scan: the form is open. */
  openForReview: boolean;
  onDeleted: () => void;
};

function useDocumentWrites(document: DocumentRow, onDeleted: () => void) {
  const actions = useDocumentActions();
  const confirmation = useWriteAttempt(DOCUMENT_FORM_COPY.saveFailed);
  const removal = useWriteAttempt(DELETE_FAILED);

  return {
    confirmError: confirmation.writeError,
    deleteError: removal.writeError,
    clearConfirmError: confirmation.clearWriteError,
    /** True once the fields are stored, so the form can close. */
    confirm: (fields: DocumentParsedFields) =>
      confirmation.attempt(() => actions.confirmFields(document.id, fields)),
    remove: () =>
      confirmDelete(() => {
        if (removal.attempt(() => actions.remove(document.id))) onDeleted();
      }),
  };
}

function OpenDocument({ document, openForReview, onDeleted }: OpenDocumentProps) {
  const writes = useDocumentWrites(document, onDeleted);
  const status = fieldsStatus(document);
  const [reviewing, setReviewing] = useState(openForReview && status !== null);
  const label = DOCUMENT_TYPE_LABELS[document.type];

  return (
    <>
      <ThemedText type="subtitle" testID="document-view-title">
        {label}
      </ThemedText>

      <DocumentImage
        documentId={document.id}
        path={document.local_file_uri}
        description={`Picture of your ${label.toLowerCase()}`}
      />

      {reviewing && status !== null ? (
        <DocumentConfirmForm
          fields={document.parsed_json}
          intro={reviewIntro(status)}
          error={writes.confirmError}
          onConfirm={(fields) => writes.confirm(fields) && setReviewing(false)}
          onNotNow={() => setReviewing(false)}
        />
      ) : (
        <DocumentFields
          document={document}
          onReview={() => {
            writes.clearConfirmError();
            setReviewing(true);
          }}
        />
      )}

      <DocumentUploadStatus document={document} />

      <InlineError testID="document-view-error" message={writes.deleteError} />
      <PressableSurface
        testID="document-delete"
        accessibilityLabel="Delete document"
        treatment="flat"
        onPress={writes.remove}
        style={styles.delete}>
        <ThemedText type="smallBold" themeColor="danger">
          Delete document
        </ThemedText>
      </PressableSurface>
    </>
  );
}

type DocumentBodyProps = {
  documentId: string;
  openForReview: boolean;
  onDeleted: () => void;
};

/** The document, or the designed reason there is none to show. */
function DocumentBody({ documentId, openForReview, onDeleted }: DocumentBodyProps) {
  const document = useDocument(documentId);

  if (document.error) {
    return (
      <ErrorState
        title="Couldn’t read the document"
        detail="The local store did not answer."
      />
    );
  }
  if (document.loading) return <LoadingState title="Loading the document" />;
  if (!document.data) {
    return (
      <EmptyState
        title="This document isn’t on this device"
        detail="It may have been deleted, or it has not come across to this device yet."
      />
    );
  }
  return (
    <OpenDocument
      document={document.data}
      openForReview={openForReview}
      onDeleted={onDeleted}
    />
  );
}

export default function DocumentViewScreen() {
  useScreenCaptureGuard();
  const router = useRouter();
  const { documentId, review } = useLocalSearchParams<{
    id: string | string[];
    documentId: string | string[];
    review: string | string[];
  }>();

  return (
    <Screen testID="document-view-screen" keyboardAware>
      <PressableSurface
        accessibilityLabel="Back"
        treatment="flat"
        onPress={() => router.back()}
        style={styles.back}>
        <ThemedText type="smallBold">Back</ThemedText>
      </PressableSurface>

      <DocumentBody
        documentId={firstParam(documentId) ?? ''}
        openForReview={firstParam(review) === '1'}
        onDeleted={() => router.back()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  delete: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
