/**
 * `UploadSummaryPill` - the one line about unfinished uploads (feature 005, T549; FR-045;
 * UI-SPEC 9.2; prototype `.syncrow`; picture `more/photos`): a cream pill with a hairline, a
 * small progress ring, "2 waiting to upload", a dot, "1 failed" and, when something failed, a
 * "Retry" at the end that puts every failed photograph back in the upload queue.
 *
 *   <UploadSummaryPill summary={summarizeUploads(photos)} onRetry={retryFailed} />
 *
 * It says what the store knows and no more (`summarizeUploads`): the store has no progress, so
 * the line is "N waiting to upload" and "N failed", never "uploading N of M". The ring is the
 * share of the trip's photographs whose bytes have arrived. It is drawn only while something is
 * unfinished (`summary` is null otherwise: nothing is drawn). The words wrap, and "Retry" goes
 * under them at the largest text sizes (`photos-scale1.5.png`); the pill is at least 44 dp tall.
 * The line is a polite live region: a photograph arriving changes the words and a screen reader
 * says so. "Retry" is a control of its own, named "Retry failed uploads".
 */
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Text } from '@/components/ui/text';
import { GALLERY_COPY } from '@/features/photos/photo-copy';
import type { UploadSummary } from '@/features/photos/upload-summary';
import { Radii, Space } from '@/theme';

export type UploadSummaryPillProps = {
  summary: UploadSummary | null;
  /** Puts the failed photographs back in the queue. */
  onRetry: () => void;
};

const RING = 20;
const RING_WIDTH = 3;

export function UploadSummaryPill({ summary, onRetry }: UploadSummaryPillProps) {
  if (!summary) return null;
  const { waiting, failed, uploaded, total } = summary;

  return (
    <View
      testID="photos-upload-summary"
      accessibilityLiveRegion="polite"
      className="flex-row flex-wrap items-center border border-separator bg-surface-secondary"
      style={{
        minHeight: 44,
        columnGap: Space[2],
        rowGap: Space[1],
        paddingVertical: Space[1],
        paddingHorizontal: Space[4],
        borderRadius: Radii.xl,
        borderCurve: 'continuous',
      }}>
      <ProgressRing value={uploaded} max={total} size={RING} strokeWidth={RING_WIDTH} />
      {waiting > 0 ? (
        <Text variant="caption" capped>
          {`${waiting} waiting to upload`}
        </Text>
      ) : null}
      {waiting > 0 && failed > 0 ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="size-1 rounded-full bg-subtle"
        />
      ) : null}
      {failed > 0 ? (
        <Text variant="caption" capped tone="danger">
          {`${failed} failed`}
        </Text>
      ) : null}
      <View className="min-w-0 flex-1" />
      {failed > 0 ? (
        <Button
          testID="photos-retry-failed"
          variant="text"
          size="sm"
          capped
          accessibilityLabel={
            failed === 1 ? GALLERY_COPY.retryAllOneLabel : GALLERY_COPY.retryAllLabel
          }
          style={{ marginEnd: -Space[3] }}
          onPress={onRetry}>
          {GALLERY_COPY.tileRetryText}
        </Button>
      ) : null}
    </View>
  );
}
