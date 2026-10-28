/**
 * The identity block of the You screen (feature 005, F13, T557; FR-058, FR-080 as amended by
 * Q-11; UI-SPEC section 8; the pictures `profile.png` and `profile-dark.png`): a 64 dp avatar of
 * the traveller's initials (decorative, the name is written beside it), the name (`title`),
 * "Traveller since 2021" (`label`, `muted`) and, at the end, the two pictured round buttons
 * "Share passport" and "Settings". Those two have no capability behind them (sharing is gated by
 * the offline-sync gate; there is no preferences store), so each is a `ComingSoonButton`: a real
 * 44 dp button that shows one toast and does nothing else. There is no profile photograph (no
 * picker) and no invented line: "Traveller since" comes from the account's creation date and is
 * left out when the session has none.
 *
 * The name wraps in full (FR-029) and is the screen's heading on iOS, where the large native
 * title gives way to this block (the layout hides that header there). The email is not pictured
 * here; it is the first row of the Account group (`profile-email`).
 *
 * Visibility posture: private. It shows the signed-in traveller's own session profile only.
 */
import type { UserProfile } from '@triptrackr/contracts';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { ComingSoonButton } from '@/components/ui/coming-soon-button';
import { Text } from '@/components/ui/text';
import { travellerSince } from '@/features/passport/passport-copy';

export function ProfileIdentity({ user }: { user: UserProfile }) {
  const since = travellerSince(user.created_at);
  return (
    <View testID="profile-identity" className="flex-row items-center gap-4">
      <Avatar name={user.display_name} size="lg" decorative />
      <View className="min-w-0 flex-1">
        <Text variant="title" testID="profile-display-name">
          {user.display_name}
        </Text>
        {since === null ? null : (
          <Text variant="label" tone="muted" testID="profile-since">
            {since}
          </Text>
        )}
      </View>
      <View className="flex-row gap-[10px]">
        <ComingSoonButton
          name="share-passport"
          label="Share passport"
          icon="share"
          variant="tonal"
        />
        <ComingSoonButton
          name="profile-settings"
          label="Settings"
          icon="settings"
          variant="tonal"
        />
      </View>
    </View>
  );
}
