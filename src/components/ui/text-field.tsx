/**
 * Recessed input primitive — contract C10.
 *
 * The recessed treatment is what makes an input identifiable as a place to type
 * BEFORE it is touched (Acceptance Scenario 1.3). Where inset shadows are
 * unavailable it falls back to the sunken fill plus a border, never to an
 * undifferentiated rectangle.
 */
import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { surfaceStyle } from '@/theme/surfaces';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Conveyed by message text as well as colour (FR-010). */
  error?: string;
};

const FocusRingWidth = 2;

export function TextField({
  label,
  value,
  onChangeText,
  error,
  ...rest
}: TextFieldProps) {
  const { theme, elevationProfile, fontScale } = useAppearance();
  const [focused, setFocused] = useState(false);
  const palette = Colors[theme];

  const surface = surfaceStyle('recessed', {
    theme,
    profile: elevationProfile,
    depth: 1,
    radius: 'sm',
    interactive: true,
  });

  return (
    <View style={styles.container}>
      <ThemedText type="small" style={styles.label}>
        {label}
      </ThemedText>

      <View
        testID="text-field-surface"
        style={[
          surface,
          error ? { borderColor: palette.danger, borderWidth: FocusRingWidth } : null,
          !error && focused
            ? { borderColor: palette.accent, borderWidth: FocusRingWidth }
            : null,
        ]}>
        <TextInput
          accessibilityLabel={label}
          aria-invalid={Boolean(error)}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={palette.textMuted}
          // FR-016: the field grows with the traveller's text size rather than
          // clipping. A fixed height is what makes large text unreadable here.
          style={[
            styles.input,
            { color: palette.textPrimary, minHeight: 44 * fontScale },
          ]}
          {...rest}
        />
      </View>

      {error ? (
        <ThemedText type="small" style={[styles.error, { color: palette.danger }]}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  label: { marginBottom: Spacing.half },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
    fontSize: 16,
  },
  error: { marginTop: Spacing.half },
});
