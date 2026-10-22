/**
 * A stored document's picture, decrypted in memory — tasks.md T118, T119
 * (FR-033, FR-034; research D-32).
 *
 * The sealed file is opened by `useDocumentImage` into base64 and shown as a
 * `data:` URI, so no plaintext copy is ever written to disk, and the picture
 * is dropped with this component. It is React Native's `Image` on purpose:
 * `expo-image` keeps a decoded copy in its disk cache by default, which would
 * put the document back on the file system in the clear.
 *
 * Every state is designed and none is blank: opening, not on this device (a
 * document another device captured), unreadable (damaged, or sealed under a key
 * this device no longer has), and the picture itself, as the HERO of the viewer
 * (005 T552, `DocumentHero`): on a fixed white `BarcodePlate` so a scanner can read
 * it in every theme, under a band naming the kind, and sized to its own proportions
 * so a tall mobile pass is as legible as a landscape booking. Nothing is drawn across
 * the picture (004 FR-033: no tint, shadow or control over it). Blocks screen capture
 * (FR-034). The unreadable state offers no retry on purpose: the file is damaged or
 * sealed under another key, and opening it again would fail the same way (004 T443).
 *
 * Visibility posture: owner-only. There is no control here to share, export,
 * copy or save the picture, and none may be added (FR-032).
 */
import { useState } from 'react';
import { Image, type ImageLoadEvent } from 'react-native';

import { BrightnessBoost } from '@/components/trip/brightness-boost';
import { DocumentHero } from '@/components/trip/document-hero';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { useDocumentImage } from '@/features/documents/use-documents';
import { useScreenCaptureGuard } from '@/features/documents/use-screen-capture-guard';

export type DocumentImageProps = {
  documentId: string;
  /** The sealed file's path in the vault, or null when there is none here. */
  path: string | null;
  /** What the picture is, for a screen reader. */
  description: string;
  /** The kind of document, on the hero's band. */
  kindLabel: string;
  /** The confirmed flight number for the band, or none. */
  flight?: string | null;
};

const DEFAULT_ASPECT = 4 / 3;
/** A sliver of a panorama is not a document; keep the frame on screen. */
const MIN_ASPECT = 0.4;
const MAX_ASPECT = 2.5;

function aspectOf(event: ImageLoadEvent): number | null {
  const { width, height } = event.nativeEvent.source;
  if (!(width > 0) || !(height > 0)) return null;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, width / height));
}

export function DocumentImage({
  documentId,
  path,
  description,
  kindLabel,
  flight = null,
}: DocumentImageProps) {
  useScreenCaptureGuard();
  const image = useDocumentImage(documentId, path);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT);

  if (image.status === 'opening') return <LoadingState title="Opening the document" />;
  if (image.status === 'absent') {
    return (
      <EmptyState
        title="The image isn’t on this device"
        detail="It was added on another device, so its picture hasn’t come across to this one."
      />
    );
  }
  if (image.status === 'unreadable') {
    return (
      <ErrorState
        title="Couldn’t open this document"
        detail="The encrypted file on this device won’t open. It may be damaged."
      />
    );
  }

  return (
    <>
      <DocumentHero kindLabel={kindLabel} flight={flight}>
        <Image
          testID="document-image"
          source={{ uri: `data:image/jpeg;base64,${image.base64}` }}
          accessibilityRole="image"
          accessibilityLabel={description}
          resizeMode="contain"
          onLoad={(event) => setAspectRatio(aspectOf(event) ?? DEFAULT_ASPECT)}
          style={{ width: '100%', aspectRatio }}
        />
      </DocumentHero>
      <BrightnessBoost />
    </>
  );
}
