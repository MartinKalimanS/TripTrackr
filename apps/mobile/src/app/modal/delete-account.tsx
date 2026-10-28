/**
 * Delete account - feature 008 (T804; FR-001 to FR-006; rest-api.md `DELETE /me`).
 *
 * A form sheet like every form (`FormSheet`: Cancel at the left of the header, the title, a scrolling
 * body and a sticky footer above the keyboard). The body says in plain words that this deletes
 * everything for good, on every device, and what goes (files included), and that a subscription is
 * not cancelled by it; it asks for the password to confirm (an account that signed in with Google or
 * Apple has none, and leaves it empty). The footer is ONE destructive action, "Delete my account",
 * busy while the request runs: never the coral primary, because this is the one thing the app must
 * not make look inviting.
 *
 * Refusals are in words, inline, and change nothing (`describeDeleteError`). On success the
 * mutation ends the session and wipes this phone's copy, and the session gate moves the app to
 * Welcome, taking this sheet with it; nothing here navigates.
 *
 * Ids: `delete-account-screen`, `delete-account-password`, `delete-account-error`,
 * `delete-account-cancel`, `delete-account-save`.
 *
 * Visibility posture: private. The password is held in this component's state only, sent in the
 * one request, and never stored or logged.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Field } from '@/components/ui/field';
import { FormSheet } from '@/components/ui/form-sheet';
import { InlineError } from '@/components/ui/inline-error';
import { Text } from '@/components/ui/text';
import {
  DELETE_ACCOUNT_COPY,
  describeDeleteError,
} from '@/features/auth/delete-account-copy';
import { useDeleteAccount } from '@/features/auth/use-delete-account';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const deletion = useDeleteAccount();
  const [password, setPassword] = useState('');

  const confirm = () => {
    if (deletion.isPending) return;
    deletion.mutate(password === '' ? {} : { password });
  };

  return (
    <FormSheet
      testID="delete-account-screen"
      title={DELETE_ACCOUNT_COPY.title}
      actions={{
        testIDPrefix: 'delete-account',
        saveLabel: DELETE_ACCOUNT_COPY.action,
        saveVariant: 'destructive',
        saveBusy: deletion.isPending,
        onCancel: () => router.back(),
        onSave: confirm,
      }}>
      <Text>{DELETE_ACCOUNT_COPY.lead}</Text>

      <View className="gap-1">
        {DELETE_ACCOUNT_COPY.lost.map((thing) => (
          <Text key={thing} variant="label" tone="muted">
            {`• ${thing}`}
          </Text>
        ))}
      </View>

      <Text variant="label" tone="muted">
        {DELETE_ACCOUNT_COPY.subscription}
      </Text>

      <Field
        testID="delete-account-password"
        label={DELETE_ACCOUNT_COPY.passwordLabel}
        description={DELETE_ACCOUNT_COPY.passwordHint}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={confirm}
      />

      <InlineError
        testID="delete-account-error"
        message={deletion.error ? describeDeleteError(deletion.error) : null}
      />
    </FormSheet>
  );
}
