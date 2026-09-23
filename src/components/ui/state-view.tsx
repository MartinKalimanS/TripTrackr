/**
 * Empty, loading, and error presentations — FR-027, contract C13.
 *
 * These states are styled to the same standard as populated screens rather than
 * left as bare defaults, which is where they usually end up. Providing them as
 * primitives is what makes FR-027 enforceable on screens that do not exist yet:
 * a screen either composes one of these or it has no defined empty state, and
 * the difference is visible in review.
 */
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Surface } from '@/components/ui/surface';
import { Colors, Spacing } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';

type StateViewProps = {
  title: string;
  detail?: string;
};

/** Nothing here yet — and that is a normal, designed state, not a failure. */
export function EmptyState({ title, detail }: StateViewProps) {
  return (
    <Surface treatment="recessed" depth={1} radius="lg" style={styles.container}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.detail}>
          {detail}
        </ThemedText>
      ) : null}
    </Surface>
  );
}

/** Work in progress. Announced, so it is not a silent pause for a screen reader. */
export function LoadingState({ title = 'Loading' }: Partial<StateViewProps>) {
  const { theme } = useAppearance();

  return (
    <Surface
      treatment="recessed"
      depth={1}
      radius="lg"
      style={styles.container}
      accessibilityLabel={title}
      accessibilityRole="progressbar">
      <ActivityIndicator color={Colors[theme].accent} />
      <ThemedText type="small" themeColor="textMuted" style={styles.detail}>
        {title}
      </ThemedText>
    </Surface>
  );
}

type ErrorStateProps = StateViewProps & {
  onRetry?: () => void;
};

/**
 * Something failed. The message is the signal, not the colour (FR-010), and a
 * retry is offered rather than leaving the traveller at a dead end.
 */
export function ErrorState({ title, detail, onRetry }: ErrorStateProps) {
  const { theme } = useAppearance();

  return (
    <Surface treatment="recessed" depth={1} radius="lg" style={styles.container}>
      <ThemedText type="smallBold" style={{ color: Colors[theme].danger }}>
        {title}
      </ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.detail}>
          {detail}
        </ThemedText>
      ) : null}
      {onRetry ? (
        <PressableSurface
          accessibilityLabel="Try again"
          onPress={onRetry}
          style={styles.retry}>
          <ThemedText type="smallBold" style={styles.retryLabel}>
            Try again
          </ThemedText>
        </PressableSurface>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  detail: {
    textAlign: 'center',
  },
  retry: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  retryLabel: {
    textAlign: 'center',
  },
});
