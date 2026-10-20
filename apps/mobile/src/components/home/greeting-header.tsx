/**
 * `GreetingHeader` - the words over the globe (feature 005, T535; contract C5-23; FR-014,
 * FR-015, FR-004, FR-077): today's date as a small `eyebrow`, and "Hello, Marta" in the display
 * face, the name being the ONE serif accent word of the screen, at most two lines. A slot at
 * the right holds the sync chip, and a 44 dp recentre control appears under the greeting only
 * when the parent gives it a handler, which it does only after the traveller has moved the
 * globe (FR-015).
 *
 *   <GreetingHeader name={user.display_name} today={today} trailing={<SyncChip ... />}
 *     onRecentre={cameraMoved ? recentre : undefined} />
 *
 * The accent is a span inside the sentence ("Hello, " then the name), so the sentence is read
 * whole, as one heading: "Hello, Marta". The date follows the device's language and is the
 * calendar day it was given, so it is the traveller's own day wherever they are. It sits over
 * the sky, which is light in every theme but the night one; both inks are token classes, and
 * the contrast of the eyebrow over the sky is the globe gate's (`Scrim` kind `sky`).
 *
 * The header does not hide itself: at the full detent the Home leaves it out (it is the
 * parent's decision, `contracts/screens.md`). Ids: `home-greeting` (the heading),
 * `home-greeting-date`, `home-recentre`.
 *
 * `welcome` is the empty Home's header (`home-empty.png`): the given words ("0 of 195 countries")
 * stand in the eyebrow's place and the heading says "Welcome", the name still the one accent.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { eyebrowDate } from '@/features/home/home-format';
import { deviceLocale } from '@/lib/locale';

export interface GreetingHeaderProps {
  /** The traveller's name; blank or `null` greets without one. */
  name: string | null;
  /** The local calendar day, YYYY-MM-DD. */
  today: string;
  /** The right edge: the sync chip. */
  trailing?: ReactNode;
  /** Present only after the globe was moved: recentres it. */
  onRecentre?: () => void;
  /** The empty Home: these words replace the date and the heading welcomes. */
  welcome?: string;
}

export function GreetingHeader({
  name,
  today,
  trailing,
  onRecentre,
  welcome,
}: GreetingHeaderProps) {
  const { languageTag } = deviceLocale();
  const who = name?.trim() ?? '';
  const hello = welcome === undefined ? 'Hello' : 'Welcome';

  return (
    <View className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5 pt-1">
          <Text variant="eyebrow" tone="muted" testID="home-greeting-date">
            {welcome ?? eyebrowDate(today, languageTag)}
          </Text>
          <Text variant="display" numberOfLines={2} testID="home-greeting">
            {who === '' ? (
              hello
            ) : (
              <>
                {hello},{' '}
                <Text variant="accent" tone="accent">
                  {who}
                </Text>
              </>
            )}
          </Text>
        </View>
        {trailing === undefined ? null : <View className="shrink-0">{trailing}</View>}
      </View>
      {onRecentre === undefined ? null : (
        <IconButton
          icon="locate"
          variant="onSky"
          accessibilityLabel="Recentre the globe"
          onPress={onRecentre}
          testID="home-recentre"
          className="self-start"
        />
      )}
    </View>
  );
}
