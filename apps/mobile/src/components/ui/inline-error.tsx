/** A write failure in words, announced as an alert, in the danger token. */
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';

export type InlineErrorProps = { testID: string; message: string | null };

export function InlineError({ testID, message }: InlineErrorProps) {
  const { theme } = useAppearance();
  if (!message) return null;
  return (
    <ThemedText
      testID={testID}
      type="small"
      accessibilityRole="alert"
      style={{ color: Colors[theme].danger }}>
      {message}
    </ThemedText>
  );
}
