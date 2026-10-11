/**
 * `FormSheet` - the body of every form that is presented as a sheet (feature 004; contract
 * C4-8 `FormActions`, C4-10 rules 5 and 8; FR-005, FR-009, FR-029, FR-030; research D4-06,
 * D-24; tasks.md T434, the pattern T436 to T438 reuse):
 *
 *   <FormSheet
 *     testID="add-trip-screen"
 *     title="New trip"
 *     actions={{ testIDPrefix: 'add-trip', saveLabel: 'Save trip', onCancel, onSave }}>
 *     <Field ... />
 *     <InlineError ... />
 *   </FormSheet>
 *
 * It gives a form four things, so no form re-derives them:
 * - a TITLE (`title`, a heading in the display face) at the head of the body, since a
 *   sheet has no native header to carry one: Android's form sheet shows neither a header
 *   nor a nested navigator (the v57 modals guide, "Android limitations"), so the title is
 *   content on both platforms;
 * - a scrolling BODY, a `KeyboardAwareScrollView` (D-24) with `keyboardShouldPersistTaps=
 *   "handled"`, as tall as its fields until the room runs out and then a scroller, so the
 *   largest text size never clips a field (FR-029);
 * - a sticky FOOTER: Cancel and Save (`FormActions`, so ids, names, emphasis and wrapping
 *   are its), outside the body. Save is never scrolled away and never under the keyboard
 *   (rule 8); the footer is opaque and padded for the home indicator;
 * - a HANDLE on Android (FR-009). iOS draws its own when `formSheetOptions` asks for it;
 *   react-native-screens 4.26 draws none on Android, so the sheet draws one.
 *
 * `host` says who moves the form for the keyboard, because the two hosts differ:
 * - `'form-sheet'` (default): a router form sheet (`presentation: 'formSheet'`,
 *   `formSheetOptions`). The PLATFORM lifts such a sheet above the keyboard on both iOS
 *   (UIKit) and Android (react-native-screens' `SheetAnimationCoordinator`, which shifts it
 *   up by the keyboard's height as far as the room above allows). A footer that also rode
 *   up with the keyboard would be lifted twice and land on the fields, so none does. What
 *   the platform cannot do is lift a sheet taller than the room, so the form is CAPPED
 *   (`sheetMaxHeight`) to the window below the status bar less the keyboard: the body
 *   scrolls and the footer stays inside what is lifted. The router sheet is as tall as its
 *   contents (`fitToContents`), which needs content sized by what is in it, not `flex: 1`.
 * - `'modal'`: a React Native `Modal` (the stop and note editors' page sheet), which
 *   nothing moves. It fills the modal, and the footer is a `KeyboardStickyView` that rides
 *   up with the keyboard; `offset.opened` is the bottom inset, which the keyboard covers
 *   anyway, so the footer sits on it and not above a gap.
 * A focused field that the keyboard would cover is scrolled clear of the footer
 * (`bottomOffset` is the footer's measured height plus a gap).
 *
 * The bottom inset: a modal host pads its footer by it; a router sheet adds none, because
 * the platform pads a sheet for the home indicator (`fitToContents` "includes small padding
 * accounting for bottom inset" on iOS; the Android sheet lets its bottom inset slide behind
 * the keyboard). With no safe-area provider above it (a bare test render) the insets are 0.
 *
 * UNVERIFIED ON A DEVICE (tasks.md T434): the keyboard behaviour of both hosts, the Android
 * handle, and the sheet's bottom padding on a phone with a home indicator rest on the
 * installed react-native-screens source and the library docs, not on a run.
 *
 * No kit import and no colour literal: colours are semantic classes.
 */
import type { NativeStackNavigationOptions } from 'expo-router';
import { useContext, useState, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { AtlasSpacing } from '@/theme';

import { FormActions, type FormActionsProps } from './form-actions';
import { Text } from './text';

export type FormSheetHost = 'form-sheet' | 'modal';

export type FormSheetProps = {
  /** The sheet's title, a heading. */
  title: string;
  /** Names the root; the body is `<testID>-body`, the footer `<testID>-footer`. */
  testID?: string;
  /** The footer: handed to `FormActions` as it is. */
  actions: FormActionsProps;
  /** Who moves the form for the keyboard (see the header). Default `'form-sheet'`. */
  host?: FormSheetHost;
  /** The fields, in reading order. */
  children: ReactNode;
};

/**
 * What the root stack hands the route that holds a form: a form sheet as tall as its
 * contents, with the platform grabber (research D4-06; contract C4-11). It belongs to the
 * route that is presented, which is the root stack's `modal` screen: a nested stack cannot
 * set it for its parent, and a nested stack is not supported inside a form sheet on Android.
 */
export const formSheetOptions = {
  presentation: 'formSheet',
  sheetAllowedDetents: 'fitToContents',
  sheetGrabberVisible: true,
} as const satisfies NativeStackNavigationOptions;

/** The strip of the window a router sheet leaves above itself, below the status bar. */
export const SHEET_TOP_GAP = AtlasSpacing.three;
/** Room above and below the footer's buttons, and between a field and the footer. */
export const FOOTER_GAP = AtlasSpacing.three;
/** The side gutter of the body and the footer (the `Screen` gutter). */
const GUTTER = AtlasSpacing.four;
/** Enough for a title and one row of actions: a tiny window never caps a form to nothing. */
const MIN_SHEET_HEIGHT = 160;

export type SheetRoom = {
  windowHeight: number;
  topInset: number;
  keyboardHeight: number;
};

/**
 * The tallest a router form sheet may be: the window below the status bar, less the gap
 * above the sheet and the keyboard. Exported so a test (and `expectActionAboveKeyboard`)
 * asserts the arithmetic itself, and so a form that wants it elsewhere reads one number.
 */
export function sheetMaxHeight({ windowHeight, topInset, keyboardHeight }: SheetRoom) {
  return Math.max(
    MIN_SHEET_HEIGHT,
    windowHeight - topInset - SHEET_TOP_GAP - keyboardHeight,
  );
}

/** `parent` is the sheet's id: the handle is named from it, written out where it is used. */
function SheetHandle({ parent }: { parent?: string }) {
  return (
    <View
      testID={parent ? `${parent}-handle` : undefined}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="self-center rounded-full bg-border"
      style={styles.handle}
    />
  );
}

type FooterProps = {
  parent?: string;
  host: FormSheetHost;
  bottomInset: number;
  onLayout: (event: LayoutChangeEvent) => void;
  actions: FormActionsProps;
};

/** Cancel and Save on an opaque strip; a modal's rides the keyboard up (see the header). */
function Footer({ parent, host, bottomInset, onLayout, actions }: FooterProps) {
  const sticks = host === 'modal';
  const content = (
    <View
      className="bg-background px-6 pt-3"
      style={{ paddingBottom: FOOTER_GAP + (sticks ? bottomInset : 0) }}>
      <FormActions {...actions} />
    </View>
  );
  if (!sticks) {
    return (
      <View testID={parent ? `${parent}-footer` : undefined} onLayout={onLayout}>
        {content}
      </View>
    );
  }
  return (
    <KeyboardStickyView
      testID={parent ? `${parent}-footer` : undefined}
      onLayout={onLayout}
      offset={{ closed: 0, opened: bottomInset }}>
      {content}
    </KeyboardStickyView>
  );
}

export function FormSheet({
  title,
  testID,
  actions,
  host = 'form-sheet',
  children,
}: FormSheetProps) {
  const insets = useContext(SafeAreaInsetsContext);
  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardState((state) =>
    state.isVisible ? state.height : 0,
  );
  const [footerHeight, setFooterHeight] = useState(0);
  const inModal = host === 'modal';

  const root = inModal
    ? styles.fill
    : {
        maxHeight: sheetMaxHeight({
          windowHeight,
          topInset: insets?.top ?? 0,
          keyboardHeight,
        }),
      };

  return (
    <View testID={testID} className="bg-background" style={root}>
      {!inModal && Platform.OS === 'android' ? <SheetHandle parent={testID} /> : null}
      <KeyboardAwareScrollView
        testID={testID ? `${testID}-body` : undefined}
        keyboardShouldPersistTaps="handled"
        bottomOffset={footerHeight + FOOTER_GAP}
        style={inModal ? styles.bodyFill : styles.body}
        contentContainerStyle={styles.bodyContent}>
        <Text type="title">{title}</Text>
        {children}
      </KeyboardAwareScrollView>
      <Footer
        parent={testID}
        host={host}
        bottomInset={insets?.bottom ?? 0}
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        actions={actions}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /** As tall as the fields, shrinking to the room and then scrolling. */
  body: { flexGrow: 0, flexShrink: 1 },
  bodyFill: { flexGrow: 1, flexShrink: 1 },
  bodyContent: {
    paddingHorizontal: GUTTER,
    paddingTop: GUTTER,
    paddingBottom: FOOTER_GAP,
    gap: FOOTER_GAP,
  },
  handle: { width: 32, height: 4, marginTop: AtlasSpacing.twelve },
});
