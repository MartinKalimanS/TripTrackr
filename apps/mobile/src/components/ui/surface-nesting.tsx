/**
 * One rule shared by the raised containers of Atlas (feature 004; FR-002, FR-006): a
 * `Card` (or a `ListGroup`, which is a raised surface too) never contains another one.
 * The product has exactly two depth levels, the canvas and a raised surface above it, so
 * a surface on a surface would be a third.
 *
 * A raised container calls `useSurfaceNestingGuard` first and wraps its children in
 * `SurfaceBoundary`. The guard counts nothing but "am I inside one": a `Panel`, which
 * draws no fill, passes straight through, so a card may sit in a panel and a panel in a
 * card. The check throws only under `__DEV__` (as the other adapter guards do), so a
 * release build never crashes on a cosmetic mistake and renders as written.
 */
import { createContext, useContext, type ReactNode } from 'react';

const InsideSurface = createContext(false);

/** Throws in development when a raised container is rendered inside another one. */
export function useSurfaceNestingGuard(owner: string): void {
  const inside = useContext(InsideSurface);
  if (__DEV__ && inside) {
    throw new Error(
      `${owner}: a card never contains another card (FR-006). Atlas has two depth ` +
        'levels, the canvas and one raised surface; group content inside a card with ' +
        'spacing or a Panel instead.',
    );
  }
}

/** Marks everything below as inside a raised container. */
export function SurfaceBoundary({ children }: { children?: ReactNode }) {
  return <InsideSurface.Provider value>{children}</InsideSurface.Provider>;
}
