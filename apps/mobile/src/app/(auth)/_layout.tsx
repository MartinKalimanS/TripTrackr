/**
 * `(auth)` group — welcome, login, register (R009; header and Back by T446).
 *
 * Access is decided by the root layout's `Stack.Protected`, which only admits
 * this group while `status === 'signed-out'` and removes it — history and all
 * — the moment a session appears. Nothing here needs to check the session
 * again; a second check would be a second place for the rule to drift.
 *
 * The header (feature 004, FR-007, FR-008; research D4-06 and "Items to verify" item 7;
 * https://docs.expo.dev/router/advanced/stack.md, "Available header options"):
 *
 * - the welcome screen has none: the product name is its heading, and it is where Back goes;
 * - Sign in and Create account have a NATIVE header carrying their title, in the display
 *   face, and a back control that is `HeaderBackButton`, so it is named "Back" on both
 *   platforms whatever the previous screen is called (the native label would be that
 *   screen's title, and Android's arrow has the platform's own description); the Maestro
 *   flows say `tapOn: 'Back'`. The props React Navigation passes to `headerLeft` are not
 *   forwarded, as in the trip layout; with the anchor below there is always a welcome
 *   screen beneath for it to pop to (`HeaderBackButton`'s own fallback, `replace('/')`,
 *   is the root's and is not reached).
 * - at the right, the text link to the OTHER form (F12, pictures `more/auth.png` and
 *   `register.png`): "Create account" on Sign in, "Sign in" on Create account
 *   (`AuthSwitchLink`, which replaces the screen so Back still lands on Welcome);
 * - the colours, and no hairline, come from `useHeaderTheme` (tokens, never a literal); the
 *   scene behind every screen is the canvas, so the bar and the page are one colour.
 */
import { Stack } from 'expo-router';

import { AuthSwitchLink } from '@/components/auth/auth-switch-link';
import { HeaderBackButton } from '@/components/ui/header-back-button';
import { useHeaderTheme } from '@/components/ui/header-theme';
import { useHeaderTitleStyle } from '@/components/ui/header-title-style';

/**
 * The group has no `index`, so the first screen must be named or the router
 * would pick one for us (https://docs.expo.dev/router/advanced/modals.md,
 * "Handle deep-linked modals" — the same `anchor` mechanism). A deep link to
 * `/login` still lands on login, with the welcome screen beneath it for Back to
 * return to; this only decides where "(auth)" itself opens.
 */
export const unstable_settings = {
  anchor: 'welcome',
};

const renderBack = () => <HeaderBackButton />;
const renderToRegister = () => <AuthSwitchLink to="register" />;
const renderToLogin = () => <AuthSwitchLink to="login" />;

export default function AuthLayout() {
  const theme = useHeaderTheme();
  // A pushed form screen has no large title: the sub-screen title, the same on both platforms
  // (the Android list header is a bigger, bolder title of its own).
  const { headerTitleStyle } = useHeaderTitleStyle();
  const pushed = {
    ...theme,
    headerShown: true,
    headerTitleStyle,
    headerLeft: renderBack,
  };

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: theme.contentStyle }}>
      <Stack.Screen
        name="login"
        options={{ ...pushed, title: 'Sign in', headerRight: renderToRegister }}
      />
      <Stack.Screen
        name="register"
        options={{ ...pushed, title: 'Create account', headerRight: renderToLogin }}
      />
    </Stack>
  );
}
