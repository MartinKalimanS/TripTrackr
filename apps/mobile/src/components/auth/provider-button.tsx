/**
 * A round "Continue with Google / Apple" button — FR-002; spec Edge Cases
 * (Accounts).
 *
 * A circular raised surface carrying the provider's logo, drawn in the app's
 * own ink on the app's own surface so the pair sits in the neumorphic palette
 * like every other control (feature 002 FR-001, contract C9). The logos are
 * Ionicons glyphs from `@expo/vector-icons`, which draws through `expo-font`
 * and so needs no native change.
 *
 * Without `onPress` the provider cannot work on this build or platform yet:
 * the button is disabled — flat, inert, announced unavailable — and its label
 * says it is coming soon. The words are in the label rather than a hint
 * because TalkBack can be set not to read hints at all.
 *
 * Before these sign people in for real, the providers' branding rules apply
 * (docs/release/store-readiness.md): Google asks for its four-colour "G" and
 * Apple for its own logo artwork in black or white.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';

export type SignInProvider = 'apple' | 'google';

const PROVIDERS = {
  apple: { name: 'Apple', logo: 'logo-apple' },
  google: { name: 'Google', logo: 'logo-google' },
} as const;

/** Logo size as a share of the circle: large enough to read, clear of the rim. */
const LOGO_RATIO = 0.45;

/** Comfortably above the platform touch target, and growing with text size. */
function useDiameter(): number {
  const { fontScale } = useAppearance();
  return (MinTouchTarget + Spacing.two) * fontScale;
}

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
  const { tokens } = useAppearance();
  const diameter = useDiameter();
  const { name, logo } = PROVIDERS[provider];
  const available = onPress !== undefined;
  const working = available && busy;

  return (
    <PressableSurface
      testID={available ? `${provider}-sign-in` : `${provider}-sign-in-unavailable`}
      accessibilityLabel={
        available ? `Continue with ${name}` : `Continue with ${name}, coming soon`
      }
      depth={2}
      radius="pill"
      busy={working}
      disabled={!available || (disabled && !working)}
      onPress={onPress}
      style={{ width: diameter, height: diameter, alignItems: 'center' }}>
      <Ionicons
        name={logo}
        size={Math.round(diameter * LOGO_RATIO)}
        color={tokens.textPrimary}
      />
    </PressableSurface>
  );
}

/** Holds a button's place while its provider is still being asked about. */
export function ProviderButtonSpacer() {
  const diameter = useDiameter();
  return <View style={{ width: diameter, height: diameter }} />;
}
