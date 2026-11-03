/**
 * `ActionAlert` - the notice that asks for a decision (spec 014 follow-up to `Banner` and
 * `Toast`): a card with a tinted icon tile, a title, the words, and up to two actions, the
 * main one filled and a quieter dismissal. Unlike a toast it does not leave by itself and
 * unlike a `Banner` it offers a choice, so it is for things the traveller should answer: a
 * plan that did not renew, a trip that needs covering.
 *
 *   <ActionAlert tone="warning" title="Billing problem"
 *     message="Your plan did not renew. Your trips stay as they are."
 *     action={{ label: 'Fix payment', onPress: openStore }}
 *     dismiss={{ label: 'Later', onPress: hide }} />
 *
 * - The icon is always drawn with the words (never colour alone) and the title and message
 *   are ONE `alert` element, so a screen reader announces them as the card appears; the
 *   actions stay separately focusable buttons.
 * - One primary action at most, as everywhere (a review rule). Colours are semantic classes.
 *
 * `testID` lands on the card; `<testID>-action` and `<testID>-dismiss` on the buttons.
 */
import { View } from 'react-native';

import { cornerOf } from '@/theme';

import { Button } from './button';
import { Icon, type IconName, type IconTone } from './icon';
import { Text } from './text';

export type ActionAlertTone = 'warning' | 'info' | 'success';

export type ActionAlertButton = {
  label: string;
  onPress: () => void;
};

export interface ActionAlertProps {
  tone: ActionAlertTone;
  title: string;
  message: string;
  action: ActionAlertButton;
  dismiss?: ActionAlertButton;
  testID?: string;
}

interface Look {
  tile: string;
  icon: IconName;
  iconTone: IconTone;
}

/** Written out in full so Tailwind finds each class by scanning the source. */
const LOOKS: Record<ActionAlertTone, Look> = {
  warning: { tile: 'bg-danger-tint', icon: 'warning', iconTone: 'danger' },
  info: { tile: 'bg-aqua-tint', icon: 'info', iconTone: 'aquaInk' },
  success: { tile: 'bg-aqua-tint', icon: 'check-circle', iconTone: 'success' },
};

export function ActionAlert({
  tone,
  title,
  message,
  action,
  dismiss,
  testID,
}: ActionAlertProps) {
  const look = LOOKS[tone];
  return (
    <View
      testID={testID}
      className="gap-3 border border-border bg-surface p-3"
      style={cornerOf('lg')}>
      <View className="flex-row items-start gap-3">
        <View
          className={`min-h-9 min-w-9 items-center justify-center ${look.tile}`}
          style={cornerOf('md')}>
          <Icon name={look.icon} size={20} tone={look.iconTone} />
        </View>
        <View
          testID={testID ? `${testID}-message` : undefined}
          accessible
          accessibilityRole="alert"
          className="flex-1">
          <Text variant="body" strong>
            {title}
          </Text>
          <Text variant="label" tone="muted">
            {message}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center justify-end gap-2">
        {dismiss ? (
          <Button
            testID={testID ? `${testID}-dismiss` : undefined}
            variant="text"
            size="sm"
            accessibilityLabel={dismiss.label}
            onPress={dismiss.onPress}>
            {dismiss.label}
          </Button>
        ) : null}
        <Button
          testID={testID ? `${testID}-action` : undefined}
          variant="primary"
          size="sm"
          accessibilityLabel={action.label}
          onPress={action.onPress}>
          {action.label}
        </Button>
      </View>
    </View>
  );
}
