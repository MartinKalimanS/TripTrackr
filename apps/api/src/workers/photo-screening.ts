import type { ModerationState } from '@triptrackr/contracts';

/**
 * Photo screening — the port the media worker asks before a photo can ever be
 * publicly visible (FR-056, SC-014; research D-12, D-34; tasks.md T113).
 *
 * **Choosing a screening provider is a precondition of User Story 7**, the
 * first story that can make a photo public. Until one is chosen — deliberately,
 * with its privacy policy and processor terms read — the only implementation is
 * {@link FailClosedPhotoScreening}, which answers `pending` for every photo.
 * Every photo therefore stays `moderation_state = 'pending'`, and the
 * `photos_public_read` policy (0005) keeps it unreachable to anyone but its
 * owner whatever visibility the owner sets. No traveller photo leaves our
 * infrastructure before then (research D-34, alternatives rejected).
 *
 * The contract for any implementation:
 *
 *   - `approved` only on a positive verdict for this image;
 *   - `rejected` for prohibited content;
 *   - `pending` whenever it cannot decide — the provider down, rate-limited,
 *     timed out, or unsure. Doubt never approves.
 *
 * The worker records the verdict through `media_record_photo` (migration 0012),
 * which applies it fail-closed as well: a rejection always lands, and an
 * approval can only lift a photo that is still `pending`.
 *
 * An implementation is shown the thumbnail — a JPEG of at most 512 px, with
 * every byte of metadata stripped — never the original. A provider chosen later
 * therefore never receives a photo's embedded position or its full-resolution
 * bytes, and screening a thumbnail is cheaper to send than the original.
 *
 * Visibility posture: reads one photo's thumbnail bytes, writes nothing; its
 * answer is a moderation state, which the RLS predicate reads.
 */
export interface PhotoScreening {
  screen(subject: ScreeningSubject): Promise<ModerationState>;
}

export interface ScreeningSubject {
  readonly photoId: string;
  /** The thumbnail: metadata-free, at most 512 px on its longer edge. */
  readonly image: Buffer;
  readonly contentType: 'image/jpeg';
}

/**
 * The only implementation until User Story 7 chooses a provider: fail-closed.
 * It has no opinion about any image, so it neither approves nor rejects —
 * `pending` is the state that keeps a photo off every public read.
 */
export class FailClosedPhotoScreening implements PhotoScreening {
  screen(_subject: ScreeningSubject): Promise<ModerationState> {
    return Promise.resolve('pending');
  }
}
