/**
 * Profile — who is signed in, sign out, and the store-mandated entry points (R009, T065;
 * restyled for Atlas by T448; 004 FR-016, FR-025, FR-030, FR-037; contract C4-11 "Profile").
 *
 * Under a native header (`profile/_layout.tsx`: a large "Profile" on iOS, a standard
 * header on Android), so the screen lays out no title of its own and is `underHeader`: the
 * scroller is the first thing it renders, which is where the large title looks for it.
 * Top to bottom:
 *
 * 1. The traveller: an `Avatar` of their initials (decorative, the name is written beside
 *    it), their name and email from the session (`GET /me` with statistics arrives in
 *    T058). Not announced as a heading: the header is the title.
 * 2. "Account" and "App" as grouped rows (`ListGroup`): the home currency, said as the one
 *    phrase it always was, and the app version, read from the embedded config
 *    (`Constants.expoConfig`, v57 expo-constants reference), which is what a traveller reads
 *    back to support.
 * 3. Sign out and Delete account, SET APART at the bottom (FR-016): a block of their own,
 *    each row in the danger ink AND with an icon, never colour alone (FR-025), and named
 *    in words. They are not rows of the groups above.
 *
 * Sign out revokes this device's refresh token and ends the local session (FR-004); the
 * local database stays on disk, encrypted, for when they return (Constitution V — see
 * db/client.ts). It pushes first (T137): if changes would be left that the server has not
 * acknowledged, the warning (`SignOutWarning`) appears directly under the row with two
 * choices, "Stay signed in" and "Sign out anyway", instead of signing out quietly; any other
 * failure is one sentence in an alert. While it runs the row is announced busy and ignores a
 * second press (FR-019).
 *
 * Delete account is visible and inert before account data exists: App Store Review
 * 5.1.1(v) and Google Play's account-deletion policy require in-app deletion to be
 * discoverable for any app with account creation. It is rather than added later and
 * forgotten (Constitution V: deletion is complete or it is not deletion).
 *
 * No control here is primary (FR-005): the screen is rows; the warning, when shown, has the
 * one primary ("Stay signed in"). Visibility posture: private. The screen shows the
 * signed-in traveller's own session profile and no one else's; nothing is read from or
 * sent to a server by this screen except the sign-out request.
 *
 * TODO(T058, T188): show statistics from `GET /me`, and wire the deletion row
 * to `DELETE /me` with a typed confirmation — the object-storage sweep the
 * server performs is what makes it safe to enable.
 */
import type { UserProfile } from '@triptrackr/contracts';
import Constants from 'expo-constants';
import { View } from 'react-native';

import { SIGN_OUT_ICON, SignOutWarning } from '@/components/auth/sign-out-warning';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { describeAuthError } from '@/features/auth/auth-errors';
import { useSessionStore } from '@/features/auth/session-store';
import { isUnsyncedChangesError, useSignOut } from '@/features/auth/use-sign-out';

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

/** The avatar, name and email, on one raised card. */
function Identity({ user }: { user: UserProfile }) {
  return (
    <Card testID="profile-identity">
      <View className="flex-row items-center gap-4">
        <Avatar name={user.display_name} size="lg" decorative />
        <View className="flex-1 gap-1">
          <Text type="headline" testID="profile-display-name">
            {user.display_name}
          </Text>
          <Text type="callout" tone="muted" testID="profile-email">
            {user.email}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** "Home currency: EUR" is one phrase to assistive technology, as it always was. */
function Account({ user }: { user: UserProfile }) {
  return (
    <ListGroup header="Account" testID="profile-account-group">
      <ListRow
        title="Home currency"
        accessibilityLabel={`Home currency: ${user.home_currency}`}
        trailing={<Text tone="muted">{user.home_currency}</Text>}
      />
    </ListGroup>
  );
}

function AppInfo() {
  return (
    <ListGroup header="App" testID="profile-app-group">
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

/** What the sign-out guard or a failure has to say, right under the row that raised it. */
function SignOutOutcome({ signOut }: { signOut: ReturnType<typeof useSignOut> }) {
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
function SetApart({ signOut }: { signOut: ReturnType<typeof useSignOut> }) {
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

export default function ProfileScreen() {
  const user = useSessionStore((session) => session.user);
  const signOut = useSignOut();

  return (
    <Screen testID="profile-screen" underHeader edges={[]}>
      {user ? <Identity user={user} /> : null}
      {user ? <Account user={user} /> : null}
      <AppInfo />
      <SetApart signOut={signOut} />
    </Screen>
  );
}
