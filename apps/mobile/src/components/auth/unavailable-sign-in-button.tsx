/**
 * A sign-in provider that cannot work here yet — FR-002, spec Edge Cases
 * (Authentication).
 *
 * Shown where the real button would be when this build or platform cannot
 * offer the provider: no Google client id configured, or Sign in with Apple
 * anywhere Apple provides no native sheet (Android). The way in stays
 * discoverable, and nothing pretends to work: the control is disabled —
 * flat, inert, announced unavailable (feature 002 contract C9) — and says
 * "Coming soon" in words, like the profile's "Delete account" row. The words
 * are part of the accessibility label rather than a hint, because TalkBack
 * can be set not to read hints at all.
 *
 * Deliberately not styled as the provider's branded button: Apple's and
 * Google's button rules apply to buttons that sign in, and the real ones
 * replace this as soon as the provider is configured.
 */
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Spacing } from '@/constants/theme';

export type SignInProvider = 'apple' | 'google';

const LABELS: Record<SignInProvider, string> = {
  apple: 'Continue with Apple',
  google: 'Continue with Google',
};

export function UnavailableSignInButton({ provider }: { provider: SignInProvider }) {
  return (
    <PressableSurface
      testID={`welcome-${provider}-sign-in-unavailable`}
      accessibilityLabel={`${LABELS[provider]}, coming soon`}
      disabled
      style={styles.action}>
      <ThemedText type="smallBold" style={styles.centred}>
        {LABELS[provider]}
      </ThemedText>
      <ThemedText type="small" themeColor="textMuted" style={styles.centred}>
        Coming soon
      </ThemedText>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  centred: { textAlign: 'center' },
});
