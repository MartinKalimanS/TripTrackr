/**
 * `PrivacyPromise` - "Expenses and documents stay private to you." (F12, T555; prototype
 * `.legal .lk`): a lock and the sentence in the aqua ink, semibold. It is a promise the
 * product keeps structurally (expenses and documents have no visibility flag, Constitution I),
 * so it may be said on the screen that asks for an account.
 */
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function PrivacyPromise() {
  return (
    <View testID="privacy-promise" className="flex-row items-center gap-2">
      <Icon name="lock" size={16} tone="aquaInk" />
      <Text variant="label" strong tone="aqua" className="shrink">
        Expenses and documents stay private to you.
      </Text>
    </View>
  );
}
