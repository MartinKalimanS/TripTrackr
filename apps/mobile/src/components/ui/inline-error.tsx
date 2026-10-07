/**
 * `InlineError` - a write failure in words (feature 004; contract C4-8; FR-025, FR-030).
 *
 *   <InlineError testID="add-trip-error" message={saveError} />
 *
 * Draws nothing without a message. With one it is an `alert` the platform announces on
 * appearance, carrying the `testID`, in the danger ink with a leading alert icon, so the
 * failure is never colour alone. The role, the `testID` and the text are on the same
 * nodes as before (screens, Jest suites and Maestro flows find them there); the icon is
 * decorative and the text wraps beside it instead of clipping at the largest text size.
 */
import { View } from 'react-native';

import { ALERT_ICON } from './alert-icon';
import { Icon } from './icon';
import { Text } from './text';

export type InlineErrorProps = { testID: string; message: string | null };

export function InlineError({ testID, message }: InlineErrorProps) {
  if (!message) return null;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      className="flex-row items-start gap-2">
      <Icon name={ALERT_ICON} size={16} tone="danger" />
      <Text type="callout" tone="danger" className="shrink">
        {message}
      </Text>
    </View>
  );
}
