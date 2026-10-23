/**
 * `PillButton` - the 52 dp pill of the Welcome screen and of the provider buttons (F12; owner
 * decision Q-11; UI-SPEC 7; prototype `.btn-pill`: min 52, padding 12 by 24, full radius,
 * a leading glyph and the words, 17 dp type).
 *
 * Two looks, the same size and weight as Apple's own button beside them (Apple Guideline 4.8:
 * Sign in with Apple is offered with Google at equal weight; Apple's is drawn by Apple, never
 * by this pill: `apple-official-button.tsx`):
 *
 * - `google`: Google's button: its white (near-black in the dark) fill, ink and 1 dp line
 *   (`GoogleButton`, the brand's rule), whose line is above 3:1 on both grounds (FR-024);
 * - `cream`: `surfaceSecondary` fill inside the same boundary - "Continue with email".
 *
 * It is a `Tappable`, so the touch target (scaled by the font scale and growing past one line
 * of text, FR-029), the focus ring and the busy and disabled announcements are the adapter's.
 * The label wraps beside the glyph at the largest text size rather than clipping. Both take
 * the adapter's pressed fill.
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
import { GoogleButton } from '@/theme/brand-artwork';

export type PillLook = 'google' | 'cream';

/** The prototype's `.btn-pill` minimum height, in dp. */
export const PILL_MIN_HEIGHT = 52;

/**
 * The height every way-in button holds at least, at a font scale: the pill's 52 dp, or the touch
 * target grown by the text size, whichever is more. One rule for the pills, the placeholder that
 * holds a button's place, and Apple's own button (`apple-official-button.tsx`), whose frame has
 * no text of the app's to grow with, so the three are the same height.
 */
export function pillMinHeight(fontScale: number): number {
  return Math.max(PILL_MIN_HEIGHT, MinTouchTarget * Math.max(1, fontScale));
}

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
  const google = look === 'google' ? GoogleButton[theme] : null;

  return (
    <Tappable
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? label}
      busy={busy}
      disabled={disabled}
      onPress={onPress}
      className={LOOK_CLASSES[look]}
      style={{
        minHeight: pillMinHeight(fontScale),
        paddingHorizontal: Space[6],
        paddingVertical: Space[3],
        ...cornerOf('full'),
        ...(google ? { backgroundColor: google.fill, borderColor: google.border } : null),
      }}>
      {leading ? <View>{leading}</View> : null}
      <Text
        variant="callout"
        className="shrink text-center"
        style={google ? { color: google.ink } : undefined}>
        {label}
      </Text>
    </Tappable>
  );
}
