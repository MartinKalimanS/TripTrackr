/**
 * You - the traveller, their passport and the store-mandated entry points (R009, T065; feature
 * 005 F13, T557; 004 FR-016, FR-025, FR-030, FR-037; 005 FR-058, FR-059, FR-080 as amended by
 * Q-11, FR-084; contracts C4-11 and C5-32 "You"; UI-SPEC section 8; the pictures `profile.png`
 * and `profile-dark.png`).
 *
 * On iOS the large native title gives way to the identity block (the layout hides that header);
 * Android keeps its standard "You" header and the scroller is `underHeader`. Top to bottom:
 *
 * 1. The identity: initials avatar, name, "Traveller since" (from the account's creation date),
 *    and the two pictured buttons Share and Settings, drawn as coming-soon controls.
 * 2. The passport (`PassportSection`): the period switch, the navy passport card, the recap
 *    entry (a coming-soon control) and the stamps page, all derived on the device from the local
 *    store for the period in view.
 * 3. "Account" (email, home currency) and "App" (version) as grouped rows.
 * 4. Sign out and Delete account, SET APART at the bottom (FR-016), danger ink AND an icon, in a
 *    block of their own. The sign-out guard (`SignOutWarning`, `sign-out-warning*`) is unchanged;
 *    Delete account opens the `modal/delete-account` sheet (feature 008).
 *
 * No control here is primary (FR-005). Visibility posture: private. The screen shows the
 * signed-in traveller's own session profile and their own local passport and no one else's;
 * nothing is read from or sent to a server by this screen except the sign-out request, and no
 * figure, preference or field is added to the store (FR-084, D5-17).
 *
 * The Maestro flows `offline/11-*` scroll to `profile-sign-out`: the passport pushes it below the
 * first screenful.
 */
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';

import { ProfileIdentity } from '@/components/profile/profile-identity';
import { Account, AppInfo, SetApart } from '@/components/profile/profile-groups';
import { PassportSection } from '@/components/profile/passport-section';
import { Screen } from '@/components/ui/screen';
import { useSessionStore } from '@/features/auth/session-store';
import { useSignOut } from '@/features/auth/use-sign-out';
import { useTourStore } from '@/features/tour/tour-store';
import { usePassport } from '@/features/passport/use-passport';
import { todayIso } from '@/features/trips/stop-dates';
import { ScreenMargin, Space } from '@/theme';

export default function ProfileScreen() {
  const android = Platform.OS === 'android';
  const user = useSessionStore((session) => session.user);
  const signOut = useSignOut();
  const router = useRouter();
  // The tour lights the Home's controls, so replaying it goes to the Globe first (feature 007).
  const takeTour = () => {
    router.navigate('/');
    useTourStore.getState().start();
  };
  // One calendar day for the whole screen, as the Home does.
  const today = todayIso();
  const passport = usePassport(today);

  return (
    <Screen
      testID="profile-screen"
      underHeader={android}
      edges={android ? [] : ['top']}
      style={{
        paddingHorizontal: android ? ScreenMargin.androidList : ScreenMargin.default,
        gap: Space[4],
      }}>
      {user ? <ProfileIdentity user={user} /> : null}
      <PassportSection
        data={passport.data}
        loading={passport.loading}
        error={passport.error}
        holder={user?.display_name ?? ''}
        today={today}
      />
      {user ? <Account user={user} /> : null}
      <AppInfo onTakeTour={takeTour} />
      <SetApart
        signOut={signOut}
        onDeleteAccount={() => router.push('/modal/delete-account')}
      />
    </Screen>
  );
}
