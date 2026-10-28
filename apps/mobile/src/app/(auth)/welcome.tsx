/**
 * Welcome — the first screen a signed-out traveller sees (R009, T064; FR-001, FR-002;
 * FR-056 and FR-019 by F12; owner decision Q-11; UI-SPEC 7; pictures `core/welcome.png` and
 * `welcome-dark.png`).
 *
 * Drawn as pictured: the sky, a static composed globe with the coral countries and arcs
 * (`WelcomeGlobe`, the approved fallback of a static globe: no second map, no Mapbox token on
 * the first screen), the decorative FIRST STAMP stamp over it, the wordmark row, and a 28 dp
 * sheet (padding 24 20 34) holding the eyebrow, the app's own tagline as the headline with ONE
 * nested serif accent word (the text is unchanged: "Plan it. Live it. Share what you want."),
 * the lede, THREE equal 52 dp buttons and the legal line.
 *
 * The three buttons (owner decision Q-11): "Continue with Apple" (iOS only: Android has no
 * Sign in with Apple, so it is not drawn there), "Continue with Google" and "Continue with
 * email". Apple and Google are `useSocialSignIn`: the SAME handlers, in-flight states and error
 * mapping as the Sign in and Create account screens, with the error said inline under the
 * buttons (an alert, words and an icon). "Continue with email" keeps the id
 * `welcome-create-account` and goes to Create account. Sign in with Apple is offered wherever
 * Google is (Guideline 4.8).
 *
 * NOT PICTURED, a necessary addition: "Already have an account? Sign in", a quiet text link
 * under the buttons that keeps the id `welcome-sign-in` and goes to Sign in. Without it a
 * returning traveller on Android with email would have no way in but Create account.
 *
 * There is no header (the `(auth)` layout hides it). The screen scrolls: the hero (the
 * wordmark and the stamp over the globe) grows into the spare room but never shrinks, so at the
 * largest text size the sheet rises over the globe and the buttons stay reachable (FR-029).
 * The sheet is `welcome-actions`' parent; the buttons are the thumb zone.
 *
 * Visibility posture: nothing traveller-owned is shown here; the screen holds no data. The
 * stamp carries today's date only as decoration, and nothing the globe draws is a trip.
 */
import { useRouter } from 'expo-router';
import { useContext } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { LegalLine } from '@/components/auth/legal-line';
import { PillButton } from '@/components/auth/pill-button';
import { ProviderStatus, useSocialSignIn } from '@/components/auth/social-sign-in';
import { WelcomeGlobe } from '@/components/auth/welcome-globe';
import { WelcomeMark } from '@/components/auth/welcome-mark';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import { liftStyle } from '@/components/ui/lift-style';
import { Scrim } from '@/components/ui/scrim';
import { Stamp } from '@/components/ui/stamp';
import { stampSpec } from '@/components/ui/stamp-spec';
import { Text } from '@/components/ui/text';
import { useAppearance } from '@/hooks/use-appearance';
import { Radii, Space } from '@/theme';

const NO_INSETS = { top: 0, bottom: 0 };
/** The picture's measurements (390 by 844 at the iPhone's 54 dp status bar): the globe's top edge. */
const GLOBE_TOP_BELOW_STATUS_BAR = 73;
/** The stamp's top, and its size and side margin: 128 dp from the top on the picture. */
const STAMP = { below: 74, size: 104, margin: Space[5] } as const;
/** What the hero holds at least: the wordmark row and the stamp, below the status bar. */
const HERO_MIN_BELOW_STATUS_BAR = 180;
const WORDMARK_BELOW_STATUS_BAR = 6;
/** The wordmark row's own height: all the hero holds when the decoration yields. */
const WORDMARK_ROW = 40;
/**
 * From this text scale the decoration yields (FR-029): the stamp is not drawn and the hero
 * shrinks to the wordmark row, so the sheet (which grows with the text) keeps its three buttons
 * as near the screen as it can. Below it the composition is as pictured.
 */
const DECORATION_YIELDS_AT = 1.3;

/** Today as the local `YYYY-MM-DD` the stamp prints: decoration, never the traveller's day. */
function todayLocal(): string {
  const now = new Date();
  const two = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** The pictured stamp: a circle in the coral ink, tilted 10 degrees, "FIRST STAMP", "TT". */
function firstStamp() {
  return {
    ...stampSpec('TT', todayLocal(), 'FIRST STAMP'),
    shape: 'circle' as const,
    ink: 'coral' as const,
    rotationDeg: -10,
  };
}

function Headline() {
  return (
    <Text variant="display" className="mt-2">
      Plan it. Live it. Share what you{' '}
      <Text variant="accent" tone="accent">
        want
      </Text>
      .
    </Text>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { tokens, themeName, fontScale } = useAppearance();
  const decorated = fontScale < DECORATION_YIELDS_AT;
  const { width } = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const social = useSocialSignIn();

  return (
    <View
      testID="welcome-screen"
      className="flex-1 bg-background"
      style={{ backgroundColor: tokens.canvas }}>
      <Scrim kind="sky" />
      <WelcomeGlobe width={width} top={insets.top + GLOBE_TOP_BELOW_STATUS_BAR} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View
          testID="welcome-hero"
          className="grow shrink-0 basis-auto"
          style={{
            minHeight:
              insets.top +
              (decorated
                ? HERO_MIN_BELOW_STATUS_BAR
                : WORDMARK_BELOW_STATUS_BAR + WORDMARK_ROW + Space[2]),
          }}>
          <View
            className="absolute flex-row items-center gap-2"
            style={{ left: Space[5], top: insets.top + WORDMARK_BELOW_STATUS_BAR }}>
            <WelcomeMark />
            <Text variant="callout">TripTrackr</Text>
          </View>
          {decorated ? (
            <View
              testID="welcome-stamp"
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                position: 'absolute',
                right: STAMP.margin,
                top: insets.top + STAMP.below,
              }}>
              <Stamp spec={firstStamp()} size={STAMP.size} testID="welcome-stamp-art" />
            </View>
          ) : null}
        </View>

        <View
          testID="welcome-sheet"
          className="bg-surface"
          style={[
            sheetShape(Math.max(insets.bottom, Space[6])),
            liftStyle(themeName, 'lift2'),
          ]}>
          <Text variant="eyebrow" tone="accent">
            Your travel passport
          </Text>
          <Headline />
          <Text variant="body" tone="muted" className="mt-2">
            Trips, photos and notes on one globe, even offline. Expenses stay only yours.
          </Text>

          <View testID="welcome-actions" className="mt-6 gap-3">
            {social.apple}
            {social.google}
            <PillButton
              testID="welcome-create-account"
              label="Continue with email"
              look="cream"
              leading={<Icon name="mail" size={20} />}
              onPress={() => router.push('/register')}
            />
            <ProviderStatus status={social.status} />
            {social.soon ? (
              <Text variant="label" tone="muted" className="text-center">
                {social.soon}
              </Text>
            ) : null}
            <InlineError testID="social-sign-in-error" message={social.error} />
            <View
              testID="welcome-sign-in-row"
              className="flex-row flex-wrap items-center justify-center gap-x-1">
              <Text variant="label" tone="muted">
                Already have an account?
              </Text>
              <Button
                testID="welcome-sign-in"
                variant="text"
                size="sm"
                accessibilityLabel="Sign in"
                onPress={() => router.push('/login')}>
                Sign in
              </Button>
            </View>
          </View>

          <View testID="welcome-legal" className="mt-4">
            <LegalLine lead="By continuing you accept the" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function sheetShape(bottom: number) {
  return {
    borderTopLeftRadius: Radii.sheet,
    borderTopRightRadius: Radii.sheet,
    borderCurve: 'continuous' as const,
    paddingTop: Space[6],
    paddingHorizontal: Space[5],
    paddingBottom: bottom,
  };
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'flex-end' },
});
