/**
 * The one "something is wrong" glyph of Atlas (feature 004; FR-025, FR-035): drawn
 * beside danger-toned words so a failure is never conveyed by colour alone. Both
 * platforms are named (contract C4-8, research D4-08).
 */
import type { IconName } from './icon';

export const ALERT_ICON: IconName = {
  ios: 'exclamationmark.triangle',
  android: 'warning',
};
