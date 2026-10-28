/**
 * `AuthSwitchLink` - the text link at the right of the Sign in and Create account header
 * ("Create account" on Sign in, "Sign in" on Create account; F12, T555; pictures
 * `more/auth.png`, `register.png`). It REPLACES the screen, so the stack stays
 * Welcome, then the form, and Back still lands on Welcome. Its name is its words.
 */
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';

export type AuthSwitchLinkProps = { to: 'login' | 'register' };

export function AuthSwitchLink({ to }: AuthSwitchLinkProps) {
  const router = useRouter();
  if (to === 'login') {
    return (
      <Button
        testID="auth-switch-link"
        variant="text"
        size="sm"
        accessibilityLabel="Sign in"
        onPress={() => router.replace('/login')}>
        Sign in
      </Button>
    );
  }
  return (
    <Button
      testID="auth-switch-link"
      variant="text"
      size="sm"
      accessibilityLabel="Create account"
      onPress={() => router.replace('/register')}>
      Create account
    </Button>
  );
}
