/**
 * `PhotoVisibilitySheet` — "Who can see these photos?" (spec 006; FR-006 to FR-010, FR-014;
 * User Story 2; plan D6-07; owner decision 2026-10-22). It opens after the picker, or the
 * camera, has handed back photos and before any is written.
 *
 *   <PhotoVisibilitySheet
 *     prompt={capture.prompt}
 *     onChoose={capture.answerPrompt}
 *     onDismiss={capture.dismissPrompt} />
 *
 * A state-driven form, so the shared pattern: a `FormSheet host="modal"` inside a `FormModal`
 * (a page sheet on iOS, a dialog on Android; the swipe down and Android's Back are the Modal's
 * `onRequestClose`; no slide with reduced motion), mounted only while photos wait, so every
 * opening starts on Private and a choice never lingers. Its parts, each with an id:
 *
 * - the title, a heading: "Who can see these photos?", or "this photo?" for one;
 * - a radio group (`photo-visibility-options`) of two radios, each one `Tappable` with the
 *   `radio` role, a name that reads both lines and its `checked` state: **Private** ("Only
 *   you", selected) and **Public** ("Can appear on a trip you choose to share"; "Nothing is
 *   shared until you publish a trip"). The selection is drawn as a ring with a dot and a
 *   coral border, so it never rests on colour alone;
 * - one muted line (`photo-visibility-note`): sharing is not available yet, so a public photo
 *   is seen only by its owner for now (the public trip view and the screening provider are
 *   not built, and a public photo stays unscreened and unreachable: FR-056), and closing the
 *   sheet adds the photos as private;
 * - the one primary, "Add N photos" (`photo-visibility-confirm`), which chooses what is
 *   selected; and "Close" in the header (`photo-visibility-cancel`), which is every other way
 *   out. "Cancel" would mislead: leaving the sheet still adds the photos, as private. The
 *   swipe and Android's Back mean the same as Close.
 *
 * The body is `FormSheet`'s scroller, so the largest text size scrolls instead of clipping. There
 * is no text field, so there is no keyboard to lift the footer over.
 *
 * Visibility posture: this sheet only asks; the answer is stored by `saveCapturedPhotos` as each
 * photo's own `is_public`. Nothing is shared, uploaded or logged here.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { FormModal } from '@/components/ui/form-modal';
import { FormSheet } from '@/components/ui/form-sheet';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import type { PhotoVisibility } from '@/features/photos/capture';
import { VISIBILITY_COPY, addPhotosLabel } from '@/features/photos/photo-copy';
import type { VisibilityPrompt } from '@/features/photos/use-capture';

export type PhotoVisibilitySheetProps = {
  /** Photos wait for the answer; null when nothing is asked and the sheet is closed. */
  prompt: VisibilityPrompt | null;
  /** The button: the photos are added with what is selected. */
  onChoose: (visibility: PhotoVisibility) => void;
  /** Close, the swipe, a tap outside, Android's Back: the photos are added private. */
  onDismiss: () => void;
};

type OptionProps = {
  id: PhotoVisibility;
  title: string;
  detail: string;
  extra?: string;
  selected: boolean;
  onSelect: (id: PhotoVisibility) => void;
};

/** The ring of a radio, and its dot when chosen: drawn, decorative, no text on it. */
function Ring({ selected }: { selected: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={
        selected
          ? 'mt-0.5 size-6 items-center justify-center rounded-full border-2 border-accent-line'
          : 'mt-0.5 size-6 items-center justify-center rounded-full border-2 border-muted'
      }>
      {selected ? <View className="size-3 rounded-full bg-accent-line" /> : null}
    </View>
  );
}

function Option({ id, title, detail, extra, selected, onSelect }: OptionProps) {
  return (
    <Tappable
      testID={`photo-visibility-${id}`}
      accessibilityRole="radio"
      accessibilityLabel={[title, detail, extra].filter(Boolean).join('. ')}
      accessibilityState={{ checked: selected, selected }}
      onPress={() => onSelect(id)}
      className={
        selected
          ? 'flex-row items-start gap-3 rounded-2xl border border-accent-line bg-accent-tint px-4 py-3'
          : 'flex-row items-start gap-3 rounded-2xl border border-separator bg-surface px-4 py-3'
      }>
      <Ring selected={selected} />
      <View className="flex-1 gap-1">
        <Text variant="body" strong>
          {title}
        </Text>
        <Text variant="callout" tone="muted">
          {detail}
        </Text>
        {extra ? (
          <Text variant="callout" tone="muted">
            {extra}
          </Text>
        ) : null}
      </View>
    </Tappable>
  );
}

type FormProps = {
  count: number;
  onChoose: (visibility: PhotoVisibility) => void;
  onDismiss: () => void;
};

function VisibilityForm({ count, onChoose, onDismiss }: FormProps) {
  const [selected, setSelected] = useState<PhotoVisibility>('private');
  const title = count === 1 ? VISIBILITY_COPY.titleOne : VISIBILITY_COPY.titleMany;

  return (
    <FormSheet
      host="modal"
      testID="photo-visibility-sheet"
      title={title}
      actions={{
        testIDPrefix: 'photo-visibility',
        saveTestID: 'photo-visibility-confirm',
        saveLabel: addPhotosLabel(count),
        cancelLabel: VISIBILITY_COPY.closeText,
        onCancel: onDismiss,
        onSave: () => onChoose(selected),
      }}>
      <View
        testID="photo-visibility-options"
        accessibilityRole="radiogroup"
        accessibilityLabel={title}
        className="gap-3">
        <Option
          id="private"
          title={VISIBILITY_COPY.privateTitle}
          detail={VISIBILITY_COPY.privateDetail}
          selected={selected === 'private'}
          onSelect={setSelected}
        />
        <Option
          id="public"
          title={VISIBILITY_COPY.publicTitle}
          detail={VISIBILITY_COPY.publicDetail}
          extra={VISIBILITY_COPY.publicExtra}
          selected={selected === 'public'}
          onSelect={setSelected}
        />
      </View>
      <Text testID="photo-visibility-note" variant="callout" tone="muted">
        {VISIBILITY_COPY.note}
      </Text>
    </FormSheet>
  );
}

export function PhotoVisibilitySheet({
  prompt,
  onChoose,
  onDismiss,
}: PhotoVisibilitySheetProps) {
  return (
    <FormModal
      testID="photo-visibility"
      visible={prompt !== null}
      onRequestClose={onDismiss}>
      {/* Remounted per opening: every question starts on Private. */}
      {prompt ? (
        <VisibilityForm count={prompt.count} onChoose={onChoose} onDismiss={onDismiss} />
      ) : null}
    </FormModal>
  );
}
