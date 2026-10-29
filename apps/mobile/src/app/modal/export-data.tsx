/**
 * Export my data - spec 009 (S-06; FR-007; rest-api.md `POST /me/export`).
 *
 * A form sheet like every form (`FormSheet`). It has four phases, driven by `useDataExport`:
 *
 *   form    what goes in the zip, how long it lasts, and the password that confirms it is the
 *           traveller (an account that signed in with Google or Apple has none and leaves it
 *           empty); the one primary is "Request my data".
 *   pending "Preparing your file". Closing the sheet loses nothing: the server keeps building,
 *           and asking again within the day adopts the same export.
 *   ready   the one primary is "Download": it hands the short-lived signed link to the system,
 *           which saves the file.
 *   ended   the file failed or its day is over; "Ask again" returns to the form.
 *
 * Refusals are in words, inline, and change nothing (`describeExportError`).
 *
 * Ids: `export-data-screen`, `export-data-password`, `export-data-error`, `export-data-pending`,
 * `export-data-ended`, `export-data-cancel`, `export-data-save` (the footer action of the phase).
 *
 * Visibility posture: private. The password is held in this component's state only, sent in the
 * one request, and never stored or logged; the link is opened, never shown or kept.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';

import { Field } from '@/components/ui/field';
import { FormSheet } from '@/components/ui/form-sheet';
import { InlineError } from '@/components/ui/inline-error';
import { Text } from '@/components/ui/text';
import { EXPORT_COPY, describeExportError } from '@/features/account/export-copy';
import { useDataExport, type ExportPhase } from '@/features/account/use-data-export';

const ACTION_LABEL: Record<ExportPhase, string> = {
  form: EXPORT_COPY.request,
  pending: EXPORT_COPY.close,
  ready: EXPORT_COPY.download,
  ended: EXPORT_COPY.again,
};

export default function ExportDataScreen() {
  const router = useRouter();
  const exporter = useDataExport();
  const [password, setPassword] = useState('');
  const { phase } = exporter;

  const act = () => {
    if (exporter.isStarting) return;
    if (phase === 'form') exporter.start(password);
    else if (phase === 'pending') router.back();
    else if (phase === 'ended') exporter.restart();
    else if (exporter.downloadUrl)
      Linking.openURL(exporter.downloadUrl).catch(() => undefined);
  };

  return (
    <FormSheet
      testID="export-data-screen"
      title={EXPORT_COPY.title}
      actions={{
        testIDPrefix: 'export-data',
        saveLabel: ACTION_LABEL[phase],
        saveBusy: exporter.isStarting,
        onCancel: () => router.back(),
        onSave: act,
      }}>
      {phase === 'form' ? (
        <>
          <Text>{EXPORT_COPY.lead}</Text>
          <Text variant="label" tone="muted">
            {EXPORT_COPY.keep}
          </Text>
          <Field
            testID="export-data-password"
            label={EXPORT_COPY.passwordLabel}
            description={EXPORT_COPY.passwordHint}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={act}
          />
          <InlineError
            testID="export-data-error"
            message={exporter.error ? describeExportError(exporter.error) : null}
          />
        </>
      ) : null}
      {phase === 'pending' ? (
        <Text testID="export-data-pending" accessibilityLiveRegion="polite">
          {EXPORT_COPY.pending}
        </Text>
      ) : null}
      {phase === 'ready' ? (
        <Text accessibilityLiveRegion="polite">{EXPORT_COPY.ready}</Text>
      ) : null}
      {phase === 'ended' ? (
        <Text testID="export-data-ended">{EXPORT_COPY.ended}</Text>
      ) : null}
    </FormSheet>
  );
}
