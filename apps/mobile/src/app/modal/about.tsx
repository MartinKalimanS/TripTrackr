/**
 * About TripTrackr - spec 010 (S-07; T193; FR-001 to FR-007).
 *
 * A read-only form sheet: the version, the legal and support links (one config module, so the
 * store-launch step changes them in one place), the retention statement in plain words, the
 * attributions and the open-source licence list. Web links open in the in-app browser, the
 * support address in the mail app; a link that cannot open says so inline and changes nothing.
 * Closing is the one primary.
 *
 * Ids: `about-screen`, `about-version`, `about-link-<id>`, `about-retention`, `about-credits`,
 * `about-licences`, `about-link-error`, `about-cancel`, `about-save` (Close).
 *
 * Visibility posture: static. Nothing of the traveller is read or sent; a link hands a public
 * URL to the browser.
 */
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { FormSheet } from '@/components/ui/form-sheet';
import { InlineError } from '@/components/ui/inline-error';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import { Text } from '@/components/ui/text';
import licences from '@/config/open-source-licenses.json';
import { legalLinks, type LegalLink } from '@/config/legal-links';
import { ABOUT_COPY } from '@/features/about/about-copy';

function describeVersion(): string {
  const config = Constants.expoConfig;
  const version = config?.version ?? 'unknown';
  const build = config?.ios?.buildNumber ?? config?.android?.versionCode;
  return build === undefined ? version : `${version} (${build})`;
}

export default function AboutScreen() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  const open = async (link: LegalLink) => {
    setFailed(false);
    try {
      if (link.external) await Linking.openURL(link.url);
      else await WebBrowser.openBrowserAsync(link.url);
    } catch {
      setFailed(true);
    }
  };

  return (
    <FormSheet
      testID="about-screen"
      title={ABOUT_COPY.title}
      actions={{
        testIDPrefix: 'about',
        saveLabel: ABOUT_COPY.close,
        onCancel: () => router.back(),
        onSave: () => router.back(),
      }}>
      <Text variant="label" tone="muted" testID="about-version">
        {`Version ${describeVersion()}`}
      </Text>
      <ListGroup header={ABOUT_COPY.legalHeader}>
        {legalLinks().map((link) => (
          <ListRow
            key={link.id}
            testID={`about-link-${link.id}`}
            title={link.title}
            accessibilityLabel={link.title}
            onPress={() => void open(link)}
          />
        ))}
      </ListGroup>
      <InlineError
        testID="about-link-error"
        message={failed ? ABOUT_COPY.linkFailed : null}
      />
      <View>
        <Text variant="callout" accessibilityRole="header">
          {ABOUT_COPY.retentionHeader}
        </Text>
        <Text testID="about-retention">{ABOUT_COPY.retention}</Text>
      </View>
      <View testID="about-credits">
        <Text variant="callout" accessibilityRole="header">
          {ABOUT_COPY.creditsHeader}
        </Text>
        <Text>{ABOUT_COPY.geonames}</Text>
        <Text>{ABOUT_COPY.maps}</Text>
      </View>
      <View testID="about-licences">
        <Text variant="callout" accessibilityRole="header">
          {ABOUT_COPY.licences}
        </Text>
        {licences.map((item) => (
          <Text key={item.name} variant="label" tone="muted">
            {`${item.name} ${item.version} - ${item.license}`}
          </Text>
        ))}
      </View>
    </FormSheet>
  );
}
