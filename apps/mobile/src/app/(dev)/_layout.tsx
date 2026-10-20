/**
 * `(dev)` group - the component gallery, development builds only (feature 005, T524;
 * research D5-18).
 *
 * Access is decided by the root layout's `Stack.Protected guard={__DEV__}`: in a release build
 * the group is unreachable, a deep link included, and `gallery.tsx` loads nothing. The group
 * renders its route with a `Slot` and no navigator of its own, as the modal group does: the
 * gallery draws its own controls and is left with the root stack's Back.
 */
import { Slot } from 'expo-router';

export default function DevLayout() {
  return <Slot />;
}
