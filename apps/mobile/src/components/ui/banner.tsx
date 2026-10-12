/**
 * `Banner` - the slim, non-blocking notice under a header (feature 005; contract C5-28;
 * screens.md Home, Trips and Trip: offline and sync error; FR-065, FR-066): an icon, words
 * and an underlined action. It never covers content and never asks for a decision.
 *
 *   <Banner tone="offline" message="Offline. 3 changes will sync when you're back online." />
 *   <Banner tone="error" message="Couldn't sync 2 changes. Your trips are safe on this phone."
 *           action={{ label: 'Retry', onPress: retry, busy: retrying }} />
 *
 * - `offline` is the amber tint with the amber ink and a wifi-off icon; `error` the danger
 *   tint with the danger ink and a cloud-alert icon. Both are an icon AND words, never a
 *   colour alone (FR-025), in a 16 dp continuous corner, the `caption` role (13 / 18 semibold)
 *   wrapping at the largest text size instead of clipping; the height is whatever the words
 *   need, with 8 dp above and below.
 * - Two siblings in one row: the words (`<testID>-message`, ONE accessibility element) and
 *   the action. The words of an `error` are an `alert`, which the platform announces as the
 *   banner appears; those of an `offline` banner are a polite live region on Android and
 *   plain text on iOS, because being offline is not an event to interrupt a screen reader
 *   for. The action is NOT inside the alert, so it stays a separately focusable button.
 * - The action is an underlined `ink` label (`Retry`) in a `Tappable`: role `button`,
 *   named by its label, the scaled platform target and the focus ring, `busy` announced and
 *   inert. Its 8 dp negative vertical margin lets the target reach the banner's edges
 *   instead of making a slim banner fat.
 *
 * `testID` lands on the row. Colours are semantic classes and `Icon` tones, never a literal.
 */
import { View, type GestureResponderEvent } from 'react-native';

import { cornerOf } from '@/theme';

import { Icon, type IconName, type IconTone } from './icon';
import { Tappable } from './tappable';
import { Text, type TextTone } from './text';

export type BannerTone = 'offline' | 'error';

export type BannerAction = {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  testID?: string;
  /** The action is under way: announced busy, presses are ignored. */
  busy?: boolean;
};

export interface BannerProps {
  tone: BannerTone;
  /** The words. */
  message: string;
  action?: BannerAction;
  testID?: string;
}

const WIFI_OFF: IconName = 'wifi-off';
const CLOUD_OFF: IconName = 'cloud-off';

interface ToneLook {
  box: string;
  ink: TextTone;
  icon: IconName;
  iconTone: IconTone;
}

/** Written out in full so Tailwind finds each class by scanning the source. */
const LOOKS: Record<BannerTone, ToneLook> = {
  offline: { box: 'bg-amber-tint', ink: 'amber', icon: WIFI_OFF, iconTone: 'amberInk' },
  error: { box: 'bg-danger-tint', ink: 'danger', icon: CLOUD_OFF, iconTone: 'danger' },
};

function Words({
  tone,
  message,
  testID,
}: Pick<BannerProps, 'tone' | 'message' | 'testID'>) {
  const look = LOOKS[tone];
  const error = tone === 'error';
  return (
    <View
      testID={testID ? `${testID}-message` : undefined}
      accessible
      accessibilityRole={error ? 'alert' : undefined}
      accessibilityLiveRegion={error ? undefined : 'polite'}
      className="flex-1 flex-row items-start gap-2">
      <Icon name={look.icon} size={20} tone={look.iconTone} />
      <Text variant="caption" tone={look.ink} className="flex-1">
        {message}
      </Text>
    </View>
  );
}

function ActionButton({ label, onPress, testID, busy }: BannerAction) {
  return (
    <Tappable
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      busy={busy}
      style={{ marginVertical: -8 }}>
      <Text variant="label" strong className="px-2 underline">
        {label}
      </Text>
    </Tappable>
  );
}

export function Banner({ tone, message, action, testID }: BannerProps) {
  return (
    <View
      testID={testID}
      className={`flex-row items-center gap-2 px-3 py-2 ${LOOKS[tone].box}`}
      style={cornerOf('lg')}>
      <Words tone={tone} message={message} testID={testID} />
      {action ? <ActionButton {...action} /> : null}
    </View>
  );
}
