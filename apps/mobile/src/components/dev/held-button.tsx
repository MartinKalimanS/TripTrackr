/**
 * `HeldButton` - a button as it looks while a finger is on it (feature 005, T524).
 *
 * A pressed button is a state of the live `Pressable`, so it cannot be seen without a
 * finger on it. This fixture draws the same look from the same pure parts the real button
 * does (`buttonLook`, `buttonFrame`, `buttonStyle`, `buttonEdgeWidth`, `pressScaleOf`), as a
 * plain view, so the held look of every variant can be read at once and compared with a
 * real press by hand. A test presses a real `Button` and asserts the two styles are equal,
 * so the fixture cannot drift from the button.
 *
 * It is not a control: it does nothing when touched. Its name says it is a held button.
 */
import { View } from 'react-native';

import {
  buttonEdgeWidth,
  buttonLook,
  type ButtonLabelKey,
  type ButtonVariant,
} from '@/components/ui/button-look';
import { buttonFrame, buttonStyle } from '@/components/ui/button';
import { Text, type TextTone } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';
import { useFontScale } from '@/hooks/use-font-scale';
import { pressScaleOf } from '@/theme';

const COLOR_KEYS = [
  'accent',
  'accentPress',
  'accentInk',
  'accentLine',
  'sand',
  'surfaceSecondary',
  'pressed',
  'dangerTint',
  'danger',
  'ink',
  'subtle',
  'hairline',
  'border',
  'focus',
] as const;

const LABEL_TONE: Record<ButtonLabelKey, TextTone> = {
  ink: 'default',
  accentInk: 'onAccent',
  danger: 'danger',
  subtle: 'subtle',
};

export interface HeldButtonProps {
  variant: ButtonVariant;
  children: string;
  testID?: string;
}

export function HeldButton({ variant, children, testID }: HeldButtonProps) {
  const fontScale = useFontScale();
  const { prefersMoreContrast, prefersLessMotion } = useAccessibilityFlags();
  const colors = useColors(COLOR_KEYS);
  const look = buttonLook(variant, { pressed: true, busy: false, disabled: false });

  const style = buttonStyle({
    frame: buttonFrame('md', false, fontScale),
    iconOnly: false,
    size: 'md',
    variant,
    fill: look.fill ? colors[look.fill as keyof typeof colors] : undefined,
    edge: look.edge ? colors[look.edge as keyof typeof colors] : undefined,
    edgeWidth: buttonEdgeWidth(variant, prefersMoreContrast),
    scale: pressScaleOf(prefersLessMotion),
    focusColor: colors.focus,
    focused: false,
  });

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${children}, shown held down`}
      style={style}>
      <Text
        variant="callout"
        tone={LABEL_TONE[look.label]}
        className="shrink text-center">
        {children}
      </Text>
    </View>
  );
}
