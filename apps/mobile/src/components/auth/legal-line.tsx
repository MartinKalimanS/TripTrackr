/**
 * `LegalLine` - "By continuing you accept the Terms and Privacy Policy." (F12; UI-SPEC 7,
 * prototype `.legal`: 12 / 16 on Welcome).
 *
 * One sentence in `muted`, the two names inside it real links (`LEGAL_URLS`), in the ink and
 * underlined, so a link is never marked by colour alone. A link is announced as a link and
 * opens the document in the system browser; if the device cannot open it, nothing happens
 * (the screen keeps working and nothing is logged: a failure is not the traveller's to be told
 * in a toast on a sign-in screen). The links are inline text, so their size is the sentence's
 * (WCAG 2.5.8 inline exception).
 *
 * The lead is the screen's: "By continuing you accept the" on Welcome, "By creating an
 * account you agree to the" on Create account. The ids are `legal-line`, `legal-terms-link`
 * and `legal-privacy-link`.
 */
import { Linking, Text as NativeText } from 'react-native';

import { Text } from '@/components/ui/text';
import { LEGAL_URLS, type LegalDocument } from '@/constants/legal-urls';
import { fontClassOf } from '@/theme';

export type LegalLineProps = {
  lead: string;
  /** `caption` (12 / 16) on Welcome, `callout` (14 / 20) in a form. Default `caption`. */
  size?: 'caption' | 'callout';
};

/** The ink and the semibold face, underlined; the size is the sentence's own. */
const LINK_CLASSES = `text-foreground underline ${fontClassOf('body', 600)}`;

function open(document: LegalDocument) {
  Linking.openURL(LEGAL_URLS[document]).catch(() => undefined);
}

export function LegalLine({ lead, size = 'caption' }: LegalLineProps) {
  return (
    <Text testID="legal-line" type={size} tone="muted" className="text-center">
      {lead}{' '}
      <NativeText
        testID="legal-terms-link"
        accessibilityRole="link"
        className={LINK_CLASSES}
        onPress={() => open('terms')}>
        Terms
      </NativeText>{' '}
      and{' '}
      <NativeText
        testID="legal-privacy-link"
        accessibilityRole="link"
        className={LINK_CLASSES}
        onPress={() => open('privacy')}>
        Privacy Policy
      </NativeText>
      .
    </Text>
  );
}
