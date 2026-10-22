/**
 * A "Continue with Google / Apple" button - FR-002; spec Edge Cases (Accounts); drawn as
 * pictured by F12 (owner decision Q-11; UI-SPEC 7 and 3.1): a 52 dp pill (`PillButton`) with
 * the provider's own logo (`BrandGlyph`) and its name in words, as wide as the screen's
 * content so the thumb finds it.
 *
 * Apple is the Sign in with Apple button (black with a white logo and label; white with black in
 * the dark themes) and Google is the outlined pill with its four-colour "G": the same size, the
 * same type and the same width, so neither has more weight (App Store Review Guideline 4.8,
 * docs/release/store-readiness.md "Branded sign-in buttons"). They are secondary controls
 * (FR-005): the screen's own coral action is the only primary one. The Apple logo is the
 * glyph of `BrandGlyph`, not Apple's downloaded artwork: that swap is a release checklist item
 * and touches `components/ui/brand-glyph.tsx` only. How Sign in with Apple is started
 * (`signInAsync`, `apple-sign-in-button.tsx`) is as it was.
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

import { BrandGlyph, type BrandGlyphName } from '@/components/ui/brand-glyph';
import { MinTouchTarget } from '@/constants/theme';

import { PILL_MIN_HEIGHT, PillButton, type PillLook } from './pill-button';

export type SignInProvider = 'apple' | 'google';

const PROVIDERS: Record<
  SignInProvider,
  { name: string; logo: BrandGlyphName; look: PillLook }
> = {
  apple: { name: 'Apple', logo: 'logo-apple', look: 'apple' },
  google: { name: 'Google', logo: 'logo-google', look: 'outline' },
};

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
  const { name, logo, look } = PROVIDERS[provider];
  const available = onPress !== undefined;
  const working = available && busy;

  return (
    <PillButton
      testID={available ? `${provider}-sign-in` : `${provider}-sign-in-unavailable`}
      accessibilityLabel={
        available ? `Continue with ${name}` : `Continue with ${name}, coming soon`
      }
      label={working ? 'Signing in…' : `Continue with ${name}`}
      look={look}
      leading={<BrandGlyph name={logo} />}
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
      style={{
        minHeight: Math.max(PILL_MIN_HEIGHT, MinTouchTarget * Math.max(1, fontScale)),
      }}
    />
  );
}
