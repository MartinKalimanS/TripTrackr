/**
 * `ComingSoonButton` and `useComingSoon` - a control the pictures draw for a capability the
 * app does not have (feature 005; owner answer Q-11; FR-080 as amended; UI-SPEC section 10).
 *
 *   <ComingSoonButton name="search" label="Search" icon="search" />
 *   <ComingSoonButton name="more" label="More" thing="Trip actions" icon="ellipsis" />
 *
 * It is DRAWN exactly as pictured (an `IconButton`, `onSky` over the globe by default) and it
 * is a real, focusable button: role button, named `label` (what the picture says), hinted
 * "Not available yet", the 44 dp disc with the platform's touch floor, id
 * `coming-soon-<name>`. Its ONLY effect is ONE toast, "<Thing> is coming soon" (the `Toast`
 * adapter; `thing` defaults to `label`). It opens nothing, navigates nowhere, writes nothing,
 * asks the network for nothing and invents no data: this file imports no router, store,
 * repository or client, and a test pins that.
 *
 * One toast at a time: every coming-soon control asks the kit for the SAME toast id, and the
 * kit shows an id once, so a second tap (on this control or another) while the toast is up
 * does not stack another. For a control that is not a round icon (a row, a text button) use
 * `useComingSoon(thing)` for its `onPress` instead.
 */
import { useCallback } from 'react';

import type { IconName } from './icon';
import { IconButton, type IconButtonVariant } from './icon-button';
import { useToast } from './toast';

/** The one toast id of every coming-soon control. */
export const COMING_SOON_TOAST_ID = 'coming-soon';
export const COMING_SOON_HINT = 'Not available yet';

/** The sentence of the toast. */
export const comingSoonMessage = (thing: string): string => `${thing} is coming soon`;

/** A stable press handler that shows the "<Thing> is coming soon" toast and nothing else. */
export function useComingSoon(thing: string): () => void {
  const toast = useToast();
  return useCallback(() => {
    toast.show({ message: comingSoonMessage(thing), id: COMING_SOON_TOAST_ID });
  }, [toast, thing]);
}

export interface ComingSoonButtonProps {
  /** The id suffix: `coming-soon-<name>` (lowercase, e.g. `search`, `share`, `more`). */
  name: string;
  /** The accessible name, as the picture says it ("Search"). */
  label: string;
  icon: IconName;
  /** The subject of the toast when it is not the label ("Trip actions"). */
  thing?: string;
  /** Default `onSky`, the disc over the globe; use the look the picture needs. */
  variant?: IconButtonVariant;
  /** Layout classes only: never colour. */
  className?: string;
}

export function ComingSoonButton({
  name,
  label,
  icon,
  thing,
  variant = 'onSky',
  className,
}: ComingSoonButtonProps) {
  const onPress = useComingSoon(thing ?? label);
  return (
    <IconButton
      icon={icon}
      variant={variant}
      accessibilityLabel={label}
      accessibilityHint={COMING_SOON_HINT}
      onPress={onPress}
      testID={`coming-soon-${name}`}
      className={className}
    />
  );
}
