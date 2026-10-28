/**
 * `ErrorSummary` - "Fix 2 things to sign in" (F12, T555; UI-SPEC 7; prototype `.errsum`):
 * above the form, once the traveller has tried, one alert that says how many problems there
 * are and names each one ("Email: Enter a valid email address."), every line a link that moves
 * to its field. The per-field messages stay under their fields; the summary is the way to see
 * them all, and to reach each, with the keyboard or a screen reader (WCAG 3.3.1, 3.3.3).
 *
 * Words and an icon, never colour alone (FR-025): the count in words, the alert glyph beside
 * it, the lines underlined as well as inked. The wrapper is the alert with an assertive live
 * region (Android speaks it), and iOS is told explicitly (`useAnnouncement`); it is NOT one
 * accessible element, because its lines are controls. It draws nothing without a problem.
 *
 * It repeats the validation messages the form already makes, in the same words: it adds no
 * error text of its own, so it cannot drift from `form-validation.ts`.
 */
import { View } from 'react-native';

import { ALERT_ICON } from '@/components/ui/alert-icon';
import { Icon } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useAnnouncement } from '@/hooks/use-announcement';
import { cornerOf } from '@/theme';

export type SummaryItem = {
  /** The field's key, handed back to `onSelect`. */
  key: string;
  /** The field's label: "Email". */
  label: string;
  /** The field's own message: "Enter a valid email address." */
  message: string;
};

export type ErrorSummaryProps = {
  /** What the traveller is trying to do, after "to": "sign in". */
  goal: string;
  items: readonly SummaryItem[];
  onSelect: (key: string) => void;
};

/** "Fix 2 things to sign in". */
export function summaryTitle(count: number, goal: string): string {
  return `Fix ${count} ${count === 1 ? 'thing' : 'things'} to ${goal}`;
}

export function ErrorSummary({ goal, items, onSelect }: ErrorSummaryProps) {
  const title = summaryTitle(items.length, goal);
  const spoken = items.length
    ? `${title}. ${items.map((item) => `${item.label}: ${item.message}`).join(' ')}`
    : null;
  useAnnouncement(spoken);
  if (items.length === 0) return null;

  return (
    <View
      testID="auth-error-summary"
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      className="gap-1 border-[1.5px] border-danger bg-danger-tint px-4 py-3"
      style={cornerOf('md')}>
      <View className="flex-row items-center gap-2">
        <Icon name={ALERT_ICON} size={20} tone="danger" />
        <Text variant="callout" tone="danger" className="shrink font-bold">
          {title}
        </Text>
      </View>
      {items.map((item) => {
        const line = `${item.label}: ${item.message}`;
        return (
          <Tappable
            key={item.key}
            accessibilityRole="link"
            accessibilityLabel={line}
            accessibilityHint={`Moves to the ${item.label} field`}
            onPress={() => onSelect(item.key)}>
            <Text variant="body" strong className="underline">
              {line}
            </Text>
          </Tappable>
        );
      })}
    </View>
  );
}
