/**
 * The label above a field of the stop editor (prototype `.lab`): 14 / 20 semibold in the ink,
 * and, right-aligned in the regular weight and the muted ink, an optional "(optional)".
 * A heading-less caption: the control under it carries the accessible name.
 */
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export type StopFieldLabelProps = {
  children: string;
  optional?: boolean;
};

export function StopFieldLabel({ children, optional }: StopFieldLabelProps) {
  return (
    <View className="flex-row flex-wrap items-baseline justify-between gap-x-2">
      <Text variant="label" strong>
        {children}
      </Text>
      {optional ? (
        <Text variant="label" tone="muted">
          (optional)
        </Text>
      ) : null}
    </View>
  );
}
