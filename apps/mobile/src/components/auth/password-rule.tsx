/**
 * `PasswordRule` - one line of the visible password rules (F12, T555; UI-SPEC 7, prototype
 * `.rules`): an icon and the rule in words, 14 / 20, the state said in the accessible name
 * as well as drawn ("At least 12 characters, met" / "..., not met yet"), so it is never
 * colour alone (FR-025). Met: the check glyph and the success ink, semibold. Unmet: the
 * neutral info glyph and the muted ink. The only rule is the contract's: a twelve-character
 * floor and no composition rule (`contracts/api/auth.ts`), so nothing else is listed.
 */
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export type PasswordRuleProps = {
  met: boolean;
  text: string;
};

export function PasswordRule({ met, text }: PasswordRuleProps) {
  return (
    <View
      testID="password-rule"
      accessible
      accessibilityLabel={`${text}, ${met ? 'met' : 'not met yet'}`}
      className="flex-row items-center gap-2">
      <Icon
        name={met ? 'check-circle' : 'info'}
        size={16}
        tone={met ? 'success' : 'muted'}
      />
      <Text
        variant="label"
        strong={met}
        tone={met ? 'success' : 'muted'}
        className="shrink">
        {text}
      </Text>
    </View>
  );
}
