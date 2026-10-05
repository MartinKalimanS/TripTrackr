/**
 * The explicit warning the sign-out guard raises — tasks.md T137
 * (Constitution V; sync-protocol.md §6 scenario 11).
 *
 * Shown when signing out would leave changes that have not reached the
 * traveller's account. It says how many, why the push could not finish, and what
 * signing out means on this device (`sign-out-copy.ts`), and then it offers
 * the two real choices: stay signed in, or sign out anyway. "Stay signed in" is
 * first and is the raised control — the safe answer is the easy one.
 *
 * It is a designed state like any other (feature 002 FR-027): text carries
 * the meaning, never colour alone (FR-010); it is an alert announced on both
 * platforms (live region on Android, an explicit announcement on iOS); and
 * nothing in it is truncated, so it reads whole at the largest text size.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Surface } from '@/components/ui/surface';
import { Spacing } from '@/constants/theme';
import {
  SIGN_OUT_COPY,
  unsyncedHeadline,
  unsyncedReason,
} from '@/features/auth/sign-out-copy';
import type { UnsyncedChangesError } from '@/features/auth/use-sign-out';
import { useAnnouncement } from '@/hooks/use-announcement';

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
    <Surface
      testID="sign-out-warning"
      treatment="recessed"
      depth={1}
      radius="lg"
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={styles.panel}>
      <ThemedText type="smallBold">{SIGN_OUT_COPY.title}</ThemedText>
      <ThemedText type="small">
        {headline} {reason}
      </ThemedText>
      <ThemedText type="small" themeColor="textMuted">
        {SIGN_OUT_COPY.consequence}
      </ThemedText>
      <View style={styles.actions}>
        <PressableSurface
          testID="sign-out-warning-stay"
          accessibilityLabel={SIGN_OUT_COPY.stayLabel}
          onPress={onStay}
          style={styles.action}>
          <ThemedText type="smallBold">{SIGN_OUT_COPY.stayLabel}</ThemedText>
        </PressableSurface>
        <PressableSurface
          testID="sign-out-warning-anyway"
          accessibilityLabel={SIGN_OUT_COPY.anywayLabel}
          accessibilityHint={SIGN_OUT_COPY.anywayHint}
          treatment="flat"
          onPress={onSignOutAnyway}
          style={styles.action}>
          <ThemedText type="smallBold" themeColor="danger">
            {SIGN_OUT_COPY.anywayLabel}
          </ThemedText>
        </PressableSurface>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  actions: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  action: {
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
