/**
 * A "Continue with Google" button - FR-002; spec Edge Cases (Accounts); drawn as pictured by
 * F12 (owner decision Q-11; UI-SPEC 7 and 3.1): a 52 dp pill (`PillButton`) with Google's own
 * four-colour "G" (`BrandGlyph`) and its name in words, as wide as the screen's content so the
 * thumb finds it, in Google's own light (dark) button.
 *
 * Sign in with Apple is NOT drawn here: Apple's logo is only ever drawn by Apple's own button
 * (`apple-official-button.tsx`, owner decision 2026-10-22), which is the same size and width, so
 * neither has more weight (App Store Review Guideline 4.8). This is a secondary control
 * (FR-005): the screen's own coral action is the only primary one.
 *
 * Without `onPress` the provider cannot work on this build or platform yet: the button is
 * disabled - dimmed, inert, announced unavailable - and its NAME says it is coming soon
 * (the visible words are the start of the name). The words are in the name rather than a
 * hint because TalkBack can be set not to read hints at all.
 *
 * While its own sign-in is in flight the button is busy: inert and announced busy, its
 * name unchanged, and the visible words say "Signing in…" so the state is not colour
 * alone (FR-025), as the screens' own actions do. While another sign-in is in flight it is
 * disabled instead.
 */
import { View, useWindowDimensions } from 'react-native';

import { BrandGlyph } from '@/components/ui/brand-glyph';

import { PillButton, pillMinHeight } from './pill-button';

export type SignInProvider = 'google';

const PROVIDERS = {
  google: { name: 'Google' },
} as const;

export type ProviderButtonProps = {
  provider: SignInProvider;
  /** Absent: the provider cannot work here yet. */
  onPress?: () => void;
  /** This provider's sign-in is in flight. */
  busy?: boolean;
  /** Something else on the screen is in flight. */
  disabled?: boolean;
};

export function ProviderButton({
  provider,
  onPress,
  busy = false,
  disabled = false,
}: ProviderButtonProps) {
  const { name } = PROVIDERS[provider];
  const available = onPress !== undefined;
  const working = available && busy;

  return (
    <PillButton
      testID={available ? `${provider}-sign-in` : `${provider}-sign-in-unavailable`}
      accessibilityLabel={
        available ? `Continue with ${name}` : `Continue with ${name}, coming soon`
      }
      label={working ? 'Signing in…' : `Continue with ${name}`}
      look="google"
      leading={<BrandGlyph name="logo-google" />}
      busy={working}
      disabled={!available || (disabled && !working)}
      onPress={onPress}
    />
  );
}

/**
 * Holds a button's place while its provider is still being asked about, so nothing
 * flashes or jumps: as tall as the button's own minimum, announcing nothing.
 */
export function ProviderButtonSpacer() {
  const { fontScale } = useWindowDimensions();
  return (
    <View
      testID="provider-button-spacer"
      style={{ minHeight: pillMinHeight(fontScale) }}
    />
  );
}
