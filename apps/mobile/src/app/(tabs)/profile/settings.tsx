/**
 * Settings, pushed from You (spec 015, T1507, FR-011). What used to sit under the passport on You:
 *
 * 1. "Account" (email, home currency, Export my data, Plan and credits once there is a plan or a
 *    credit) and "App" (Take the tour, About, version), as grouped rows.
 * 2. Sign out and Delete account, SET APART at the bottom (004 FR-016), danger ink AND an icon, in a
 *    block of their own. The sign-out guard (`SignOutWarning`, `sign-out-warning*`) is unchanged;
 *    Delete account opens the `modal/delete-account` sheet (feature 008).
 *
 * The ids are the ones You had (`profile-email`, `profile-sign-out`, `profile-delete-account`, ...),
 * so the Maestro flows only gain the tap on Settings. No control here is primary (FR-005).
 * Visibility posture: private; it shows the signed-in traveller's own session profile, and sends
 * nothing but the sign-out request.
 */
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';

import { Account, AppInfo, SetApart } from '@/components/profile/profile-groups';
import { Screen } from '@/components/ui/screen';
import { useSessionStore } from '@/features/auth/session-store';
import { useSignOut } from '@/features/auth/use-sign-out';
import { useEntitlement } from '@/features/billing/use-entitlement';
import { useTourStore } from '@/features/tour/tour-store';
import { ScreenMargin, Space } from '@/theme';

export default function SettingsScreen() {
  const android = Platform.OS === 'android';
  const user = useSessionStore((session) => session.user);
  const signOut = useSignOut();
  const router = useRouter();
  const { entitlement } = useEntitlement();
  // Silent until there is something to show: a plan, or at least one trip credit.
  const holdsAnything =
    entitlement !== null && (entitlement.tier !== null || entitlement.credits > 0);
  // The tour lights the Home's controls, so replaying it goes to the Globe first (feature 007).
  const takeTour = () => {
    router.navigate('/');
    useTourStore.getState().start();
  };

  return (
    <Screen
      testID="settings-screen"
      underHeader
      edges={[]}
      style={{
        paddingHorizontal: android ? ScreenMargin.androidList : ScreenMargin.default,
        gap: Space[4],
      }}>
      {user ? (
        <Account
          user={user}
          onExportData={() => router.push('/modal/export-data')}
          onManagePlan={
            holdsAnything ? () => router.push('/modal/manage-subscription') : undefined
          }
        />
      ) : null}
      <AppInfo onTakeTour={takeTour} onAbout={() => router.push('/modal/about')} />
      <SetApart
        signOut={signOut}
        onDeleteAccount={() => router.push('/modal/delete-account')}
      />
    </Screen>
  );
}
