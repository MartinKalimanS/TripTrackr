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
 * The screen draws its own bar, as the picture does (the navigator's header is hidden for this
 * route: `trip/[id]/_layout.tsx`; 005 T552, FR-050): a close disc at the start (a cross, named
 * "Back" because the flows and the contract name it so), the kind of document centred (the
 * words it always had, `document-view-title`) and the "Only you" chip at the end. Under it: the scan as the
 * hero (`DocumentHero`: the picture on a white `BarcodePlate`), the pictured brightness line as a
 * coming-soon control, the cream details group and Delete. While it is only being looked at the
 * screen has no primary control (checking the details is secondary, Delete is destructive); with
 * the form open, "Confirm details" is the one primary (FR-005). A document the store cannot read
 * offers "Try again", which reads it afresh by mounting the reader again (`key`): the capture
 * guard lives in the screen above, so a retry never leaves the document unprotected.
 *
 * The pictured "Share a copy", the copy-reference control and the "Linked to" row are NOT drawn:
 * a document is never shareable (constitution I, D-05) and the data has no reference or link.
 *
 * This screen blocks screen capture while a document is on it (FR-034), and
 * offers no way to share, export, copy or publish the document — there is no
 * such control anywhere in the product (FR-032, Acceptance 5.5).
 * `useLocalSearchParams` is expo-router's v57 hook for a screen's own params.
 */
import type { DocumentParsedFields } from '@triptrackr/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useContext, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { DocumentConfirmForm } from '@/components/trip/document-confirm-form';
import {
  DocumentInfoGroup,
  DocumentUploadStatus,
} from '@/components/trip/document-details';
import { DocumentImage } from '@/components/trip/document-image';
import { areaMargin } from '@/components/ui/area-header';
import { Button } from '@/components/ui/button';
import type { IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { InlineError } from '@/components/ui/inline-error';
import { PrivacyChip } from '@/components/ui/privacy-chip';
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
import { Space } from '@/theme';

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
        className="self-center">
        Delete
      </Button>
    </>
  );
}

function OpenDocument({ document, openForReview, onDeleted }: OpenDocumentProps) {
  const writes = useDocumentWrites(document, onDeleted);
  const status = fieldsStatus(document);
  const [reviewing, setReviewing] = useState(openForReview && status !== null);
  const label = DOCUMENT_TYPE_LABELS[document.type];

  const confirmed = status === 'confirmed' ? document.parsed_json : null;

  return (
    <>
      <DocumentImage
        documentId={document.id}
        path={document.local_file_uri}
        description={`Picture of your ${label.toLowerCase()}`}
        kindLabel={label}
        flight={confirmed?.flight_number ?? null}
      />

      {reviewing && status !== null ? (
        <DocumentConfirmForm
          fields={document.parsed_json}
          intro={reviewIntro(status)}
          error={writes.confirmError}
          onConfirm={(fields) => writes.confirm(fields) && setReviewing(false)}
          onNotNow={() => setReviewing(false)}
        />
      ) : null}

      <DocumentInfoGroup
        document={document}
        showFields={!reviewing}
        onReview={() => {
          writes.clearConfirmError();
          setReviewing(true);
        }}
      />

      <DocumentUploadStatus document={document} />

      <DeleteDocument error={writes.deleteError} onDelete={writes.remove} />
    </>
  );
}

type DocumentBodyProps = {
  documentId: string;
  openForReview: boolean;
  onBack: () => void;
  onDeleted: () => void;
  onRetry: () => void;
};

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };
const CLOSE: IconName = 'x';

/**
 * The viewer's own bar (picture `more/document-view`): the close disc, the kind centred, the
 * "Only you" chip. Drawn in every state, so a document that will not open can still be left.
 */
function ViewerBar({ title, onBack }: { title: string | null; onBack: () => void }) {
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const margin = areaMargin();

  return (
    <View
      testID="document-view-bar"
      className="min-h-11 flex-row items-center"
      style={{
        marginTop: insets.top + Space[1],
        paddingStart: margin + insets.left,
        paddingEnd: margin + insets.right,
        gap: Space[2],
      }}>
      <IconButton
        testID="document-view-close"
        icon={CLOSE}
        variant="tonal"
        accessibilityLabel="Back"
        onPress={onBack}
      />
      <View className="min-w-0 flex-1" style={styles.titleBox}>
        {title ? (
          <Text
            variant="callout"
            numberOfLines={1}
            accessibilityRole="header"
            testID="document-view-title"
            className="text-center">
            {title}
          </Text>
        ) : null}
      </View>
      <PrivacyChip />
    </View>
  );
}

/** The document, or the designed reason there is none to show. */
function DocumentContent({
  document,
  openForReview,
  onDeleted,
  onRetry,
}: {
  document: ReturnType<typeof useDocument>;
  openForReview: boolean;
  onDeleted: () => void;
  onRetry: () => void;
}) {
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

function DocumentBody({
  documentId,
  openForReview,
  onBack,
  onDeleted,
  onRetry,
}: DocumentBodyProps) {
  const document = useDocument(documentId);
  const type = document.error || document.loading ? undefined : document.data?.type;

  return (
    <View className="flex-1 bg-background">
      <ViewerBar title={type ? DOCUMENT_TYPE_LABELS[type] : null} onBack={onBack} />
      <Screen testID="document-view-screen" keyboardAware edges={['bottom']}>
        <DocumentContent
          document={document}
          openForReview={openForReview}
          onDeleted={onDeleted}
          onRetry={onRetry}
        />
      </Screen>
    </View>
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
    <DocumentBody
      key={attempt}
      documentId={firstParam(documentId) ?? ''}
      openForReview={firstParam(review) === '1'}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onDeleted={() => router.back()}
      onRetry={() => setAttempt((count) => count + 1)}
    />
  );
}

const styles = StyleSheet.create({
  titleBox: { justifyContent: 'center' },
});
