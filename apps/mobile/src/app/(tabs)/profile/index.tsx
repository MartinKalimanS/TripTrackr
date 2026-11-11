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
 *    and Settings, which opens `profile/settings` (spec 015, T1507, FR-011).
 * 2. The passport (`PassportSection`): the period switch, the navy passport card, the recap
 *    entry and the stamps page, all derived on the device from the local store for the period in
 *    view.
 *
 * Account, App, Sign out and Delete account moved to Settings (spec 015, FR-011).
 *
 * No control here is primary (FR-005). Visibility posture: private. The screen shows the
 * signed-in traveller's own session profile and their own local passport and no one else's;
 * nothing is read from or sent to a server by this screen, and no figure, preference or field
 * is added to the store (FR-084, D5-17).
 */
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';

import { ProfileIdentity } from '@/components/profile/profile-identity';
import { PassportSection } from '@/components/profile/passport-section';
import { Screen } from '@/components/ui/screen';
import { useSessionStore } from '@/features/auth/session-store';
import { usePassport } from '@/features/passport/use-passport';
import { todayIso } from '@/features/trips/stop-dates';
import { ScreenMargin, Space } from '@/theme';

export default function ProfileScreen() {
  const android = Platform.OS === 'android';
  const user = useSessionStore((session) => session.user);
  const router = useRouter();
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
      {user ? (
        <ProfileIdentity
          user={user}
          onSettings={() => router.push('/profile/settings')}
        />
      ) : null}
      <PassportSection
        data={passport.data}
        loading={passport.loading}
        error={passport.error}
        holder={user?.display_name ?? ''}
        today={today}
      />
    </Screen>
  );
}
