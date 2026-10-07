/**
 * The cue of a tappable card or row (feature 004; FR-024): a trailing chevron in the
 * muted ink, the "row cue" pair of the contrast gate (`muted` on `surface` at the 3:1
 * non-text floor, `test/theme/palette-gate-support.ts`). Shared by `Card` and `ListRow`
 * so the two cannot drift. It is decorative: the control it sits in already has its
 * accessible name.
 */
import { Icon, type IconName } from './icon';

/** `chevron.forward` mirrors itself in a right-to-left layout on iOS. */
export const CHEVRON: IconName = { ios: 'chevron.forward', android: 'chevron_right' };

export function PressCue({ testID }: { testID?: string }) {
  return <Icon name={CHEVRON} size={20} tone="muted" testID={testID} />;
}
