/**
 * A "Continue with Google / Apple" button — FR-002; spec Edge Cases (Accounts); restyled
 * for Atlas by T446 (FR-005, FR-024, FR-025, FR-026, FR-029; contract C4-11 "outline
 * social buttons").
 *
 * An OUTLINED control: no fill, a hairline in the `border` token (the boundary the colour
 * gate measures at 3:1, FR-024), the provider's logo and its name in words, as wide as the
 * screen's content so the thumb finds it. It is a secondary control (FR-005): the screen's
 * own action is the only primary one. It is a `Tappable`, so the touch target (scaled by
 * the font scale, and growing past one line of text rather than clipping, FR-029), the
 * focus ring and the pressed fill are the adapter's, and the label wraps beside the logo.
 *
 * Google and Apple are drawn by this one component: the same size and the same prominence
 * (App Store Review Guideline 4.8, docs/release/store-readiness.md), a logo
 * (`BrandGlyph`) and the words "Continue with <Provider>". This restyle does NOT claim the
 * providers' branding rules are met, and what has to be done before release is unchanged:
 * the logos are monochrome glyphs in the app's ink, while Google asks for its four-colour
 * "G" and Apple for its own logo artwork in black or white (the checklist's "Branded
 * sign-in buttons" row). Swapping them touches `components/ui/brand-glyph.tsx` only. How
 * Sign in with Apple is started (`signInAsync`, `apple-sign-in-button.tsx`) is as it was.
 *
 * Without `onPress` the provider cannot work on this build or platform yet: the button is
 * disabled — dimmed, inert, announced unavailable — and its NAME says it is coming soon
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
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { MinTouchTarget } from '@/constants/theme';

export type SignInProvider = 'apple' | 'google';

const PROVIDERS: Record<SignInProvider, { name: string; logo: BrandGlyphName }> = {
  apple: { name: 'Apple', logo: 'logo-apple' },
  google: { name: 'Google', logo: 'logo-google' },
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
  const { name, logo } = PROVIDERS[provider];
  const available = onPress !== undefined;
  const working = available && busy;

  return (
    <Tappable
      testID={available ? `${provider}-sign-in` : `${provider}-sign-in-unavailable`}
      accessibilityLabel={
        available ? `Continue with ${name}` : `Continue with ${name}, coming soon`
      }
      busy={working}
      disabled={!available || (disabled && !working)}
      onPress={onPress}
      className="flex-row items-center justify-center gap-3 self-stretch border border-border px-4">
      <BrandGlyph name={logo} />
      <Text type="body" className="shrink text-center font-medium">
        {working ? 'Signing in…' : `Continue with ${name}`}
      </Text>
    </Tappable>
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
      style={{ minHeight: MinTouchTarget * Math.max(1, fontScale) }}
    />
  );
}
