/**
 * `HeroBackButton` - the Back control over the trip's picture (tasks.md T546; contract C5-20;
 * screens.md "Trip"; spec FR-007, FR-025, FR-071, FR-081): the `headerLeft` of the transparent
 * native header of `trip/[id]/index`.
 *
 * A 44 dp disc on the dark translucent `scrimButton` fill with a white chevron (the glass
 * `IconButton`), because a control floating over a photograph sits on a disc and never on the
 * picture itself (FR-007). It is named "Back" whatever the previous screen is called, so the
 * Maestro flows' `tapOn: 'Back'` resolves, and it has no word beside the chevron. It goes back, or
 * home when the trip was opened with nothing beneath it (a deep link), and it never vanishes: the
 * props the navigator passes to `headerLeft` are not forwarded, as `HeaderBackButton`'s are not.
 * The router is asked when the button is pressed, not when it renders.
 *
 * LOCAL SEAM: the chrome branch (T528) restyles `HeaderBackButton` with a `glass` variant for the
 * hero. Until it lands this is the same behaviour on the glass `IconButton`; when it does, the
 * header option in `_layout.tsx` swaps to that and this file goes.
 */
import { useRouter } from 'expo-router';

import { IconButton } from '@/components/ui/icon-button';

export function HeroBackButton() {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <IconButton
      icon="chevron-left"
      variant="glass"
      accessibilityLabel="Back"
      onPress={goBack}
    />
  );
}
