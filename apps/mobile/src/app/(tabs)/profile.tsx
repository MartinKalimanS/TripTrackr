/**
 * Profile — placeholder (R009).
 *
 * Two things are here on purpose before any account data exists:
 *
 *   - The app version, read from the embedded config
 *     (`Constants.expoConfig`, v57 expo-constants reference). It is what a
 *     traveller reads back to support, so it belongs on the first cut.
 *   - The account-deletion entry point. App Store Review 5.1.1(v) and Google
 *     Play's account-deletion policy require in-app deletion to be discoverable
 *     for any app with account creation. It is visible now and inert, rather
 *     than added later and forgotten (Constitution V: deletion is complete or
 *     it is not deletion).
 *
 * TODO(T058, T188): show the traveller's profile from `GET /me`, and wire the
 * deletion row to `DELETE /me` with a typed confirmation — the object-storage
 * sweep the server performs is what makes it safe to enable.
 */
import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { Surface } from '@/components/ui/surface';
import { Spacing } from '@/constants/theme';

/**
 * "1.0.0 (12)" when a build number is embedded, "1.0.0" otherwise. With
 * `cli.appVersionSource: "remote"` (eas.json) the build number lives on EAS
 * and is stamped into the binary, not into the config, so the bare version is
 * the expected shape for store builds until `expo-application` is adopted.
 */
function describeVersion(): string {
  const config = Constants.expoConfig;
  const version = config?.version ?? 'unknown';
  const build = config?.ios?.buildNumber ?? config?.android?.versionCode;
  return build === undefined ? version : `${version} (${build})`;
}

export default function ProfileScreen() {
  return (
    <Screen testID="profile-screen" edges={['top']}>
      <ThemedText type="subtitle">Profile</ThemedText>

      <Surface treatment="raised" depth={1} radius="lg" style={styles.card}>
        <View style={styles.row}>
          <ThemedText type="small">Version</ThemedText>
          <ThemedText type="small" themeColor="textMuted" testID="profile-version">
            {describeVersion()}
          </ThemedText>
        </View>
      </Surface>

      <Surface treatment="raised" depth={1} radius="lg" style={styles.card}>
        <PressableSurface
          testID="profile-delete-account"
          accessibilityLabel="Delete account"
          accessibilityHint="Permanently removes your account and everything you recorded"
          treatment="flat"
          disabled
          style={styles.rowAction}>
          <ThemedText type="smallBold" themeColor="danger">
            Delete account
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            Available once sign-in is set up
          </ThemedText>
        </PressableSurface>
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowAction: {
    alignItems: 'flex-start',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
});
