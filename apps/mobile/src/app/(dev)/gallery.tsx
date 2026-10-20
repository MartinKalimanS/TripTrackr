/**
 * The component gallery route (feature 005, T524; research D5-18): `/gallery`, reachable only
 * in development (the root layout's `Stack.Protected guard={__DEV__}`).
 *
 * The gallery is `require`d INSIDE `if (__DEV__)`, not imported at the top. A release bundle
 * replaces `__DEV__` with `false` and folds the branch away, so Metro never follows the
 * `require` and nothing of `components/dev` ships. This file and the group's layout are the
 * only files outside `components/dev` that name it.
 */

/** A type only: erased at build time, so it pulls nothing into the bundle. */
type GalleryModule = typeof import('@/components/dev/gallery');

export default function GalleryRoute() {
  if (__DEV__) {
    // A `require`, not an import: that is what keeps the module out of a release bundle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Gallery } = require('@/components/dev/gallery') as GalleryModule;
    return <Gallery />;
  }
  return null;
}
