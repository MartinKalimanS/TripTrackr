/**
 * The device colour scheme, or, inside a dev-gallery scope, the one it is showing
 * (`appearance-override.ts`, feature 005 T524). Outside a scope this is React Native's own
 * hook, unchanged.
 */
import { useColorScheme as useDeviceColorScheme } from 'react-native';

import { useAppearanceOverride } from '@/hooks/appearance-override';

export function useColorScheme(): ReturnType<typeof useDeviceColorScheme> {
  const device = useDeviceColorScheme();
  const override = useAppearanceOverride();
  return override ? override.scheme : device;
}
