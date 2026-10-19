/**
 * T530 - how much a scene keeps clear at the bottom (feature 005, contract C5-21, research
 * D5-05; FR-023, FR-024). The tab pill floats over the scenes, so a scene must be told where
 * its top edge is: the navigator hands every scene the height the bar reported
 * (`BottomTabBarHeightContext`, 88 dp on a 390 by 844 phone: the pill's 64 plus the 24 below
 * it), and a list ends with at least that plus 16 dp, a button floats 16 dp above it.
 *
 * The tab layout publishes that height on a light context of its own (`TabInsetContext`, by
 * `screenLayout`: `test/app/tabs-layout.test.tsx` proves it over the real navigator), so the
 * scroll containers that read it do not import the whole router. A screen pushed above the tabs
 * has no such context (the pill is not shown there), so it keeps nothing clear: the hook answers
 * zero outside the tab navigator instead of throwing as `useBottomTabBarHeight()` does.
 */
import { renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { TabInsetContext } from './tab-inset-context';
import { TAB_CLEARANCE, tabInsetOf, useTabInset } from './use-tab-inset';

const inside = (height: number) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(TabInsetContext.Provider, { value: height }, children);
  };

describe('tabInsetOf()', () => {
  test('is the pill height plus 16 dp, or nothing where there is no pill', () => {
    expect(TAB_CLEARANCE).toBe(16);
    expect(tabInsetOf(88)).toBe(104);
    expect(tabInsetOf(0)).toBe(16);
    expect(tabInsetOf(undefined)).toBe(0);
  });

  test('grows with a pill that grew with the text size', () => {
    expect(tabInsetOf(140)).toBe(156);
  });
});

describe('useTabInset()', () => {
  test('reads the height the pill reported through the navigator, plus the clearance', async () => {
    const { result } = await renderHook(() => useTabInset(), { wrapper: inside(88) });
    expect(result.current).toBe(104);
  });

  test('follows the pill when it changes height', async () => {
    const { result, rerender } = await renderHook(() => useTabInset(), {
      wrapper: inside(88),
    });
    expect(result.current).toBe(104);
    await rerender({});
    expect(result.current).toBe(104);
  });

  test('is zero outside the tab navigator, where no pill is drawn, and does not throw', async () => {
    const { result } = await renderHook(() => useTabInset());
    expect(result.current).toBe(0);
  });
});
