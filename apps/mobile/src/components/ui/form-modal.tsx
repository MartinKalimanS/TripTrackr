/**
 * `FormModal` - the React Native `Modal` that holds a `FormSheet host="modal"` (feature 004;
 * contract C4-8, C4-10 rules 5 and 8; FR-009, FR-022; research D4-06). The stop editor and the
 * note editor are state-driven sheets, not routes, so both sit in one of these.
 *
 *   <FormModal testID="note-editor" visible={visible} onRequestClose={onCancel}>
 *     {visible ? <FormSheet host="modal" testID="note-editor" ... /> : null}
 *   </FormModal>
 *
 * - `presentationStyle="pageSheet"` (iOS; Android has no such thing and shows a full-screen
 *   dialog) and `allowSwipeDismissal`: with it a swipe down on iOS dismisses the sheet through
 *   `onRequestClose` (RN 0.86 fires it for the swipe), without it the sheet cannot be swiped
 *   away. `onRequestClose` is also Android's Back, so the caller wires it to Cancel.
 * - Reduced motion: the sheet does not slide in (`animationType="none"`; the photo viewer's
 *   precedent, feature 002 FR-015).
 * - No `statusBarTranslucent` or `navigationBarTranslucent`: with edge-to-edge on (the Expo
 *   default since SDK 54) react-native's Modal reports both bars translucent whatever the
 *   props say (`ReactModalHostView`: `field || isEdgeToEdgeFeatureFlagOn`), so on Android the
 *   content runs under the status bar and the frame pads it by the top inset. iOS needs no
 *   padding: a page sheet starts below the status bar.
 * - A page sheet draws no handle, so the frame draws one on iOS (FR-009); it is decoration,
 *   hidden from assistive technology.
 * - Ids: `<testID>-modal` (the Modal), `<testID>-frame` (the canvas) and `<testID>-handle`.
 *
 * The caller mounts its form only while `visible`, so a cancelled draft does not linger.
 *
 * UNVERIFIED ON A DEVICE (tasks.md T437, T438): the page sheet and the swipe on iOS, the handle
 * beside the system's own, the sticky footer inside a dragged page sheet (keyboard-controller
 * discussion 867), the footer on the keyboard and the top inset on Android.
 */
import { useContext, type ReactNode } from 'react';
import { Modal, Platform, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useAppearance } from '@/hooks/use-appearance';

export type FormModalProps = {
  /** Prefix of the ids this modal adds: `<testID>-modal`, `-frame` and `-handle`. */
  testID: string;
  visible: boolean;
  /** The swipe down on iOS and Android's Back: the caller's Cancel. */
  onRequestClose: () => void;
  children: ReactNode;
};

/** Where a page sheet has none of its own: decoration, so assistive technology skips it. */
function SheetHandle({ testID }: { testID: string }) {
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="mt-3 h-1 w-8 self-center rounded-full bg-border"
    />
  );
}

/**
 * The Modal's content frame: the canvas, the handle on iOS, and on Android the room under
 * the status bar that the edge-to-edge Modal draws beneath. The platform is read at render,
 * and the insets from the context (0 with no provider above it).
 */
function Frame({ testID, children }: { testID: string; children: ReactNode }) {
  const insets = useContext(SafeAreaInsetsContext);
  const topInset = Platform.OS === 'android' ? (insets?.top ?? 0) : 0;

  return (
    <View
      testID={`${testID}-frame`}
      className="flex-1 bg-background"
      style={{ paddingTop: topInset }}>
      {Platform.OS === 'ios' ? <SheetHandle testID={`${testID}-handle`} /> : null}
      {children}
    </View>
  );
}

export function FormModal({ testID, visible, onRequestClose, children }: FormModalProps) {
  const { prefersLessMotion } = useAppearance();

  return (
    <Modal
      testID={`${testID}-modal`}
      visible={visible}
      animationType={prefersLessMotion ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      allowSwipeDismissal
      onRequestClose={onRequestClose}>
      <Frame testID={testID}>{children}</Frame>
    </Modal>
  );
}
