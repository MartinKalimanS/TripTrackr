/**
 * The explicit warning the sign-out guard raises — tasks.md T137, restyled for Atlas by
 * T448 (Constitution V; sync-protocol.md §6 scenario 11; 004 FR-005, FR-016, FR-025).
 *
 * Shown when signing out would leave changes that have not reached the
 * traveller's account. It says how many, why the push could not finish, and what
 * signing out means on this device (`sign-out-copy.ts`), and then it offers
 * the two real choices: stay signed in, or sign out anyway. Neither is removed or
 * renamed: ids, names and the hint are what Maestro row 11 and the screen readers
 * already know. "Stay signed in" is first and is the one primary control, so the
 * safe answer is the easy one (FR-005); "Sign out anyway" is the destructive one.
 *
 * It is a designed state like any other (feature 002 FR-027): text carries
 * the meaning, never colour alone (FR-025: a caution icon beside the title, an icon
 * on the destructive choice); the whole panel is an alert announced on both
 * platforms (live region on Android, an explicit announcement on iOS); and
 * nothing in it is truncated, so it reads whole at the largest text size, the
 * buttons wrapping their labels.
 *
 * The alert, its live region and its id are on a plain wrapper, not on the card: a card
 * with nothing to press announces nothing of its own and takes no live region.
 */
import { View } from 'react-native';

import { ALERT_ICON } from '@/components/ui/alert-icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  SIGN_OUT_COPY,
  unsyncedHeadline,
  unsyncedReason,
} from '@/features/auth/sign-out-copy';
import type { UnsyncedChangesError } from '@/features/auth/use-sign-out';
import { useAnnouncement } from '@/hooks/use-announcement';

/** The destructive choice leaves the account: the same door as the Sign out row. */
export const SIGN_OUT_ICON: IconName = 'log-out';

export type SignOutWarningProps = {
  error: UnsyncedChangesError;
  /** "Stay signed in". */
  onStay: () => void;
  /** "Sign out anyway" — the traveller has read the above and chosen to go. */
  onSignOutAnyway: () => void;
};

export function SignOutWarning({ error, onStay, onSignOutAnyway }: SignOutWarningProps) {
  const headline = unsyncedHeadline(error.remaining);
  const reason = unsyncedReason(error.failure);

  useAnnouncement(`${SIGN_OUT_COPY.title}. ${headline} ${reason}`);

  return (
    <View
      testID="sign-out-warning"
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive">
      <Card className="gap-3">
        <View className="flex-row items-start gap-2">
          <Icon
            name={ALERT_ICON}
            size={20}
            tone="pending"
            testID="sign-out-warning-icon"
          />
          <Text variant="callout" className="shrink">
            {SIGN_OUT_COPY.title}
          </Text>
        </View>
        <Text variant="label">
          {headline} {reason}
        </Text>
        <Text variant="label" tone="muted">
          {SIGN_OUT_COPY.consequence}
        </Text>
        <View className="mt-1 gap-2">
          <Button
            variant="primary"
            testID="sign-out-warning-stay"
            accessibilityLabel={SIGN_OUT_COPY.stayLabel}
            onPress={onStay}
            className="self-stretch">
            {SIGN_OUT_COPY.stayLabel}
          </Button>
          <Button
            variant="destructive"
            icon={SIGN_OUT_ICON}
            testID="sign-out-warning-anyway"
            accessibilityLabel={SIGN_OUT_COPY.anywayLabel}
            accessibilityHint={SIGN_OUT_COPY.anywayHint}
            onPress={onSignOutAnyway}
            className="self-stretch">
            {SIGN_OUT_COPY.anywayLabel}
          </Button>
        </View>
      </Card>
    </View>
  );
}
