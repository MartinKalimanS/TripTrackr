/**
 * `BrightnessBoost` - the pictured "brightness is raised while the code is showing" line under
 * the viewer's hero (feature 005, T552; UI-SPEC section 10: "brightness boost over a barcode"
 * has no capability behind it; owner answer Q-11).
 *
 * It is drawn as pictured (a sun and a muted caption, centred) but it is a COMING-SOON control:
 * a real button, role button, named "Raise brightness for the code", hinted "Not available
 * yet", 44 dp at the least, whose only effect is one toast ("Brightness boost is coming soon").
 * The caption does NOT claim the screen is brighter, because nothing changes the brightness:
 * the picture's words would be a lie. `coming-soon-document-brightness`.
 */
import { View } from 'react-native';

import { COMING_SOON_HINT, useComingSoon } from '@/components/ui/coming-soon-button';
import { Icon } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { Space } from '@/theme';

export function BrightnessBoost() {
  const onPress = useComingSoon('Brightness boost');
  return (
    <View className="items-center" style={{ marginTop: Space[2] }}>
      <Tappable
        testID="coming-soon-document-brightness"
        accessibilityLabel="Raise brightness for the code"
        accessibilityHint={COMING_SOON_HINT}
        onPress={onPress}>
        <View className="flex-row items-center justify-center" style={{ gap: Space[1] }}>
          <Icon name="sun" size={16} tone="muted" />
          <Text variant="caption" tone="muted" strong>
            Brightness boost
          </Text>
        </View>
      </Tappable>
    </View>
  );
}
