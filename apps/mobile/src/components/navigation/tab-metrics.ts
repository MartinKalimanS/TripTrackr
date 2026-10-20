/**
 * The numbers the floating tab pill and the Android navigation bar are laid out with, in dp,
 * and the pure arithmetic over them (feature 005, contract C5-21, research D5-05 and D5-21;
 * FR-022, FR-024). Exported so a test sums the same constants the components render with, and
 * so a screen that floats a control above the bar reads the same clearance.
 */

/** The floating pill (iOS). */
export const PillMetrics = {
  /** A MINIMUM: the pill grows with the text size, it is never given a height. */
  height: 64,
  /** Between the edge of the pill and its tabs and capsule. */
  padding: 6,
  /** Between two tabs. */
  gap: 4,
  /** From the left and right edges of the screen. */
  sideMargin: 16,
  /** How far the home indicator's inset is pulled up into the pill's bottom edge. */
  bottomInsetOffset: 10,
  /** The pill's bottom edge on a device with no inset. */
  bottomMin: 12,
  /** The fade under the pill, so content does not collide with it. */
  fadeHeight: 48,
  /** What a scene keeps free ABOVE the pill (lists, buttons, toasts): FR-024. */
  clearance: 16,
  /** An `Icon` size: icons do not scale with the font scale. */
  iconSize: 24,
  /** Between the icon and the label. */
  iconLabelGap: 2,
  /** The label: DM Sans 600 at 12 over 14 (the prototype's `.tab`), capped at 1.3 times. */
  labelSize: 12,
  labelLine: 14,
  /** The selected capsule in the dark themes: white at this opacity (`.tab.is-on`). */
  darkCapsuleAlpha: 0.14,
  /** 64 - 2 x 6: a tab is at least this tall, above 44 pt and 48 dp (FR-071). */
  tabMinHeight: 64 - 2 * 6,
} as const;

/**
 * The Android navigation bar (D5-21), measured from the reference (`reference/prototype/styles.css`,
 * `:root[data-platform='android'] .tabbar`: padding 12 8 24, a 64 dp bar and the 24 dp gesture
 * inset below it, edge to edge). The 24 is the system's own bottom inset, never a constant.
 */
export const AndroidBarMetrics = {
  /**
   * A MINIMUM above the system inset, the top hairline and the 12 dp padding included: the bar
   * grows with the text size, it is never given a height.
   */
  height: 64,
  /** The hairline on the bar's top edge (1 dp, the reference's `0 -1px 0`). */
  hairline: 1,
  /** Above the indicator. */
  paddingTop: 12,
  /** Left and right, added to the system's side insets. */
  paddingX: 8,
  /** The least a tab is tall, the Android touch target. */
  tabMinHeight: 48,
  /** The indicator behind the selected icon. */
  indicatorWidth: 56,
  indicatorHeight: 32,
  /** Between the indicator and the label. */
  indicatorLabelGap: 4,
  iconSize: 24,
  /** The label: 12 / 14, semibold on every tab, capped at 1.3 times. */
  labelSize: 12,
  labelLineHeight: 14,
  /** The indicator is the accent at this opacity: 26% in light, 28% in dark. */
  indicatorOpacity: { light: 0.26, dark: 0.28 },
} as const;

/**
 * The pill's bottom edge: the home indicator's inset less 10 dp, never below 12 dp. 24 dp on
 * a phone with a 34 dp inset, 12 dp on one with none.
 */
export function pillBottomOffset(insetBottom: number): number {
  return Math.max(insetBottom - PillMetrics.bottomInsetOffset, PillMetrics.bottomMin);
}

/**
 * What the pill reports to the navigator through `BottomTabBarHeightCallbackContext`, which
 * every scene reads as `useBottomTabBarHeight()`: its own height plus the gap below it, the
 * distance from the bottom of the screen to the pill's top edge (88 dp on a 390 by 844
 * phone).
 */
export function pillReportedHeight(height: number, insetBottom: number): number {
  return height + pillBottomOffset(insetBottom);
}

export interface CapsuleLayout {
  /** The width of one tab, and of the capsule behind the selected one. */
  tabWidth: number;
  /** How far the capsule is moved (`translateX`) to sit under tab `index`. */
  offsetOf: (index: number) => number;
}

/**
 * Where the capsule goes: tabs share the pill's width equally after the padding on both
 * sides and the gaps between them, so tab `i` starts `i x (tabWidth + gap)` from the first.
 * Pure; a width that cannot hold the tabs answers zero rather than a negative size.
 */
export function capsuleLayout(trackWidth: number, count: number): CapsuleLayout {
  const gaps = PillMetrics.gap * Math.max(count - 1, 0);
  const inner = trackWidth - 2 * PillMetrics.padding - gaps;
  const tabWidth = count > 0 ? Math.max(inner / count, 0) : 0;
  return { tabWidth, offsetOf: (index) => index * (tabWidth + PillMetrics.gap) };
}
