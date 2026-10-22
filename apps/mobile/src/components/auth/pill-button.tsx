/**
 * `PillButton` - the 52 dp pill of the Welcome screen and of the provider buttons (F12; owner
 * decision Q-11; UI-SPEC 7; prototype `.btn-pill`: min 52, padding 12 by 24, full radius,
 * a leading glyph and the words, 17 dp type).
 *
 * Three looks, all the same size and weight (Apple Guideline 4.8: Sign in with Apple is
 * offered with Google at equal weight):
 *
 * - `apple`: the Sign in with Apple button, black with a white label, and white with a black
 *   label in the dark themes (`AppleButton`, the brand's rule, not a palette colour);
 * - `google`: Google's button: its white (near-black in the dark) fill, ink and 1 dp line
 *   (`GoogleButton`, the brand's rule), whose line is above 3:1 on both grounds (FR-024);
 * - `cream`: `surfaceSecondary` fill inside the same boundary - "Continue with email".
 *
 * It is a `Tappable`, so the touch target (scaled by the font scale and growing past one line
 * of text, FR-029), the focus ring and the busy and disabled announcements are the adapter's.
 * The label wraps beside the glyph at the largest text size rather than clipping. A pressed
 * `apple` pill shows its focus ring and no fill (the pressed fill would put the white label
 * on a light ground); the other two take the adapter's pressed fill.
 *
 * It is a control with a fixed look, not a `Button` variant: a Button primary is the one
 * coral action of a screen, and the Welcome screen has none.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { MinTouchTarget } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { Space, cornerOf } from '@/theme';
import { AppleButton, GoogleButton } from '@/theme/brand-artwork';

export type PillLook = 'apple' | 'google' | 'cream';

/** The prototype's `.btn-pill` minimum height, in dp. */
export const PILL_MIN_HEIGHT = 52;

export type PillButtonProps = {
  testID: string;
  /** The visible words; also the accessible name unless `accessibilityLabel` says more. */
  label: string;
  look: PillLook;
  /** The logo or icon before the words (decorative). */
  leading?: ReactNode;
  accessibilityLabel?: string;
  onPress?: () => void;
  busy?: boolean;
  disabled?: boolean;
};

const BASE = 'flex-row items-center justify-center gap-3 self-stretch';
const LOOK_CLASSES: Record<PillLook, string> = {
  apple: BASE,
  google: `${BASE} border`,
  cream: `${BASE} border border-border bg-surface-secondary`,
};

export function PillButton({
  testID,
  label,
  look,
  leading,
  accessibilityLabel,
  onPress,
  busy = false,
  disabled = false,
}: PillButtonProps) {
  const { theme, fontScale } = useAppearance();
  const brand = look === 'google' ? GoogleButton[theme] : AppleButton[theme];
  const branded = look !== 'cream';
  const apple = look === 'apple';

  return (
    <Tappable
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? label}
      busy={busy}
      disabled={disabled}
      onPress={onPress}
      feedback={apple ? 'ring' : 'fill'}
      className={LOOK_CLASSES[look]}
      style={{
        minHeight: Math.max(PILL_MIN_HEIGHT, MinTouchTarget * Math.max(1, fontScale)),
        paddingHorizontal: Space[6],
        paddingVertical: Space[3],
        ...cornerOf('full'),
        ...(branded ? { backgroundColor: brand.fill } : null),
        ...(look === 'google' ? { borderColor: GoogleButton[theme].border } : null),
      }}>
      {leading ? <View>{leading}</View> : null}
      <Text
        variant="callout"
        className="shrink text-center"
        style={branded ? { color: brand.ink } : undefined}>
        {label}
      </Text>
    </Tappable>
  );
}
