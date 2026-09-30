/**
 * Where a photo's bytes are, when they are not yet safe — tasks.md T117
 * (FR-041; Constitution II; feature 002 FR-007, FR-010).
 *
 * A photo is not "saved" until its bytes have uploaded, so a photo still on
 * this device alone says so, and a photo whose upload failed says THAT — a
 * different word, a different glyph and a different outline, never a different
 * hue alone. Both are announced as the words they show. This is the photo's
 * own counterpart of `SyncBadge`, whose "Not yet synced" would be the wrong
 * words for a picture that has not left the phone.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Radius, Spacing } from '@/constants/theme';
import { GALLERY_COPY, UPLOAD_STATE_COPY } from '@/features/photos/photo-copy';
import { useAppearance } from '@/hooks/use-appearance';

export type PhotoStatus = 'pending' | 'failed';

const GLYPH: Record<PhotoStatus, string> = { pending: '○', failed: '△' };

export function PhotoStatusBadge({ status }: { status: PhotoStatus }) {
  const { tokens } = useAppearance();
  const tint = status === 'failed' ? tokens.danger : tokens.accent;
  const label = UPLOAD_STATE_COPY[status].badge;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.badge,
        // Pending is dashed (as `SyncBadge` and the pending surface are);
        // a failure is solid, so the two never differ by colour alone.
        { borderColor: tint, borderStyle: status === 'pending' ? 'dashed' : 'solid' },
      ]}>
      <ThemedText type="small" style={{ color: tint }}>
        {GLYPH[status]}
      </ThemedText>
      <ThemedText type="small" style={[styles.label, { color: tint }]}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Puts a failed photo back in the upload queue. `onPress` is a local write. */
export function PhotoRetryButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableSurface
      accessibilityLabel={GALLERY_COPY.retryLabel}
      treatment="flat"
      radius="sm"
      onPress={onPress}
      style={styles.retry}>
      <ThemedText type="smallBold">{GALLERY_COPY.retryText}</ThemedText>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  // A long caption wraps inside the tile instead of pushing past its edge.
  label: { flexShrink: 1 },
  retry: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
