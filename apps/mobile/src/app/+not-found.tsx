/**
 * Not found — a designed state, not the router's default (FR-027, R009; restyled for Atlas
 * by T449, 004 FR-035).
 *
 * Reached from a stale deep link or a share URL for a trip that has since been
 * removed. It sits outside both `Stack.Protected` groups so that it renders for
 * signed-in and signed-out travellers alike; the link home then lands wherever
 * the gate says it should.
 *
 * Plain words in a centred state (`EmptyState`) and ONE control, the way home, which is
 * therefore the screen's primary (FR-005). It is still a `Link` (`asChild`): the router
 * hands its child `onPress`, `href` and `role="link"` and the Atlas `Button` forwards them,
 * so assistive technology still hears a link named "Back to your globe" (FR-030).
 */
import { Link } from 'expo-router';

import { Button } from '@/components/ui/button';
import type { IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/state-view';

const LOST: IconName = { ios: 'questionmark.circle', android: 'help' };

/** The state sits in the middle of the screen, not at its top. */
const CENTRED = { justifyContent: 'center' } as const;

export default function NotFoundScreen() {
  return (
    <Screen testID="not-found-screen" style={CENTRED}>
      <EmptyState
        title="This page does not exist"
        detail="The link may be out of date, or the trip may have been removed."
        icon={LOST}
      />
      <Link href="/" asChild>
        <Button accessibilityLabel="Back to your globe" className="self-center">
          Back to your globe
        </Button>
      </Link>
    </Screen>
  );
}
