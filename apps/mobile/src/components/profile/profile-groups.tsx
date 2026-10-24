/**
 * The groups of the You screen below the passport (feature 005, F13, T557; FR-016, FR-025,
 * FR-081; contract C4-11 "Profile"; UI-SPEC section 8): "Account" (the email and the home
 * currency), "App" (the version) and the set-apart block with Sign out and Delete account. They
 * are the rows the screen always had, with their ids, names, hints and behaviour unchanged.
 *
 * - Account: the email (`profile-email`, now a row: the identity block is drawn as pictured and
 *   the picture has no email line) and "Home currency: EUR" said as the one phrase it always was.
 * - App: "Take the tour" (replays the first-run tour, feature 007) and the version, read from the embedded config (`Constants.expoConfig`, which is what a
 *   traveller reads back to support).
 * - Set apart (FR-016): Sign out and Delete account, each in the danger ink AND with an icon,
 *   never colour alone (FR-025), in a block of their own. Sign out revokes this device's refresh
 *   token and ends the local session; it pushes first (T137): if changes would be left that the
 *   server has not acknowledged, `SignOutWarning` appears under the row with "Stay signed in" and
 *   "Sign out anyway", unchanged. Delete account is visible and inert ("Coming soon") until
 *   `DELETE /me` exists (T188): App Store Review 5.1.1(v) and Google Play require in-app deletion
 *   to be discoverable, and it never claims to do what it does not.
 *
 * Visibility posture: private. Nothing is read from or sent to a server here except the sign-out
 * request.
 */
import type { UserProfile } from '@triptrackr/contracts';
import Constants from 'expo-constants';
import { View } from 'react-native';

import { SIGN_OUT_ICON, SignOutWarning } from '@/components/auth/sign-out-warning';
import { Icon } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import { Text } from '@/components/ui/text';
import { describeAuthError } from '@/features/auth/auth-errors';
import { isUnsyncedChangesError, type useSignOut } from '@/features/auth/use-sign-out';

/**
 * "1.0.0 (12)" when a build number is embedded, "1.0.0" otherwise. With
 * `cli.appVersionSource: "remote"` (eas.json) the build number lives on EAS
 * and is stamped into the binary, not into the config, so the bare version is
 * the expected shape for store builds until `expo-application` is adopted.
 */
function describeVersion(): string {
  const config = Constants.expoConfig;
  const version = config?.version ?? 'unknown';
  const build = config?.ios?.buildNumber ?? config?.android?.versionCode;
  return build === undefined ? version : `${version} (${build})`;
}

/** Deletion is not wired yet (T188): the row is pressable-shaped but never acts. */
const NOT_AVAILABLE_YET = () => undefined;

/** The email and "Home currency: EUR" is one phrase to assistive technology, as it always was. */
export function Account({ user }: { user: UserProfile }) {
  return (
    <ListGroup header="Account" testID="profile-account-group">
      <ListRow
        title="Email"
        accessibilityLabel={`Email: ${user.email}`}
        trailing={
          <Text tone="muted" className="shrink text-right" testID="profile-email">
            {user.email}
          </Text>
        }
      />
      <ListRow
        title="Home currency"
        accessibilityLabel={`Home currency: ${user.home_currency}`}
        trailing={<Text tone="muted">{user.home_currency}</Text>}
      />
    </ListGroup>
  );
}

export function AppInfo({ onTakeTour }: { onTakeTour: () => void }) {
  return (
    <ListGroup header="App" testID="profile-app-group">
      <ListRow
        testID="profile-take-tour"
        title="Take the tour"
        description="A quick look at how the app works"
        accessibilityLabel="Take the tour"
        accessibilityHint="Opens the Globe and walks you through the app"
        onPress={onTakeTour}
      />
      <ListRow
        title="Version"
        trailing={
          <Text tone="muted" testID="profile-version">
            {describeVersion()}
          </Text>
        }
      />
    </ListGroup>
  );
}

type SignOut = ReturnType<typeof useSignOut>;

/** What the sign-out guard or a failure has to say, right under the row that raised it. */
function SignOutOutcome({ signOut }: { signOut: SignOut }) {
  const unsynced = isUnsyncedChangesError(signOut.error) ? signOut.error : null;
  if (unsynced) {
    return (
      <SignOutWarning
        error={unsynced}
        onStay={() => signOut.reset()}
        onSignOutAnyway={() => signOut.mutate({ force: true })}
      />
    );
  }
  return (
    <InlineError
      testID="profile-sign-out-error"
      message={signOut.error ? describeAuthError(signOut.error) : null}
    />
  );
}

/** Sign out and Delete account: set apart from the groups, destructive by ink and icon. */
export function SetApart({ signOut }: { signOut: SignOut }) {
  return (
    <View testID="profile-actions" className="mt-4 gap-3">
      <ListGroup>
        <ListRow
          testID="profile-sign-out"
          title={signOut.isPending ? 'Signing out…' : 'Sign out'}
          description="Your trips are kept on this device, encrypted."
          tone="destructive"
          leading={
            <Icon
              name={SIGN_OUT_ICON}
              size={20}
              tone="danger"
              testID="profile-sign-out-icon"
            />
          }
          accessibilityLabel="Sign out"
          accessibilityHint="Signs out on this device. Your trips stay on the device, encrypted."
          busy={signOut.isPending}
          onPress={() => signOut.mutate()}
        />
      </ListGroup>
      <SignOutOutcome signOut={signOut} />
      <ListGroup>
        <ListRow
          testID="profile-delete-account"
          title="Delete account"
          description="Coming soon"
          tone="destructive"
          accessibilityLabel="Delete account"
          accessibilityHint="Permanently removes your account and everything you recorded"
          disabled
          onPress={NOT_AVAILABLE_YET}
        />
      </ListGroup>
    </View>
  );
}
