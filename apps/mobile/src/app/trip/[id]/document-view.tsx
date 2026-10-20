/**
 * One travel document — tasks.md T118, T119 (FR-031, FR-034, FR-035, FR-041;
 * Acceptance Scenarios 5.3, 5.4, 5.5); research D-32, D-33; restyled for Atlas by 004 T443
 * (contract C4-10; FR-005, FR-007, FR-008, FR-015, FR-033, FR-035, FR-037).
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
 * Under a native header (`_layout.tsx`: "Document" and Back), so the screen is
 * `underHeader` with no bar of its own; its heading is the kind of document, in the
 * words it always had (`document-view-title`). While it is only being looked at the
 * screen has no primary control (checking the details is secondary, Delete is
 * destructive); with the form open, "Confirm details" is the one primary (FR-005). The
 * picture is framed by a hairline and nothing is drawn across it (FR-033). A document
 * the store cannot read offers "Try again", which reads it afresh by mounting the reader
 * again (`key`): the capture guard lives in the screen above, so a retry never leaves the
 * document unprotected.
 *
 * This screen blocks screen capture while a document is on it (FR-034), and
 * offers no way to share, export, copy or publish the document — there is no
 * such control anywhere in the product (FR-032, Acceptance 5.5).
 * `useLocalSearchParams` is expo-router's v57 hook for a screen's own params.
 */
import type { DocumentParsedFields } from '@triptrackr/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { DocumentConfirmForm } from '@/components/trip/document-confirm-form';
import { DocumentFields, DocumentUploadStatus } from '@/components/trip/document-details';
import { DocumentImage } from '@/components/trip/document-image';
import { Button } from '@/components/ui/button';
import type { IconName } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
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
const TRASH: IconName = 'trash';

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
      confirmation.attemptSave(() => actions.confirmFields(document.id, fields)),
    remove: () =>
      confirmDelete(() => {
        if (removal.attemptRemoval(() => actions.remove(document.id))) onDeleted();
      }),
  };
}

/** The one destructive control, with a failed delete said in words just above it. */
function DeleteDocument({
  error,
  onDelete,
}: {
  error: string | null;
  onDelete: () => void;
}) {
  return (
    <>
      <InlineError testID="document-view-error" message={error} />
      <Button
        testID="document-delete"
        variant="destructive"
        icon={TRASH}
        accessibilityLabel="Delete document"
        onPress={onDelete}
        className="self-start">
        Delete document
      </Button>
    </>
  );
}

function OpenDocument({ document, openForReview, onDeleted }: OpenDocumentProps) {
  const writes = useDocumentWrites(document, onDeleted);
  const status = fieldsStatus(document);
  const [reviewing, setReviewing] = useState(openForReview && status !== null);
  const label = DOCUMENT_TYPE_LABELS[document.type];

  return (
    <>
      <Text type="title" testID="document-view-title">
        {label}
      </Text>

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

      <DeleteDocument error={writes.deleteError} onDelete={writes.remove} />
    </>
  );
}

type DocumentBodyProps = {
  documentId: string;
  openForReview: boolean;
  onDeleted: () => void;
  onRetry: () => void;
};

/** The document, or the designed reason there is none to show. */
function DocumentBody({
  documentId,
  openForReview,
  onDeleted,
  onRetry,
}: DocumentBodyProps) {
  const document = useDocument(documentId);

  if (document.error) {
    return (
      <ErrorState
        title="Couldn’t read the document"
        detail="The local store did not answer."
        onRetry={onRetry}
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
  const [attempt, setAttempt] = useState(0);
  const { documentId, review } = useLocalSearchParams<{
    id: string | string[];
    documentId: string | string[];
    review: string | string[];
  }>();

  return (
    <Screen testID="document-view-screen" keyboardAware underHeader>
      <DocumentBody
        key={attempt}
        documentId={firstParam(documentId) ?? ''}
        openForReview={firstParam(review) === '1'}
        onDeleted={() => router.back()}
        onRetry={() => setAttempt((count) => count + 1)}
      />
    </Screen>
  );
}
