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
 * - a HEADER (feature 005, F6; UI-SPEC 3.6): Cancel (a text button, `<prefix>-cancel`) at the
 *   left, the TITLE (`title`, the `callout` role, a heading) centred, and `headerTrailing` at
 *   the right ("Only you"; dropped from text scale 1.5). A sheet has no native header to carry
 *   these: Android's form sheet shows neither a header nor a nested navigator (the v57 modals
 *   guide, "Android limitations"), so the header is content on both platforms. It stands
 *   outside the scrolling body, so Cancel never scrolls away;
 * - a scrolling BODY, a `KeyboardAwareScrollView` (D-24) with `keyboardShouldPersistTaps=
 *   "handled"`, as tall as its fields until the room runs out and then a scroller, so the
 *   largest text size never clips a field (FR-029);
 * - a sticky FOOTER: Save alone (`FormActions`: the one primary, full width, 56 dp), outside
 *   the body. Save is never scrolled away and never under the keyboard (rule 8); the footer
 *   is opaque and padded for the home indicator, with an optional hairline above it
 *   (`footerRule`). The body and the footer are padded 20 dp at the sides; `gap` is the space
 *   between fields;
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

import { useFontScale } from '@/hooks/use-font-scale';
import { Space } from '@/theme';

import { FormActions, FormCancel, type FormActionsProps } from './form-actions';
import { Text } from './text';

export type FormSheetHost = 'form-sheet' | 'modal';

export type FormSheetProps = {
  /** The sheet's title, a heading. */
  title: string;
  /** Names the root; the body is `<testID>-body`, the footer `<testID>-footer`. */
  testID?: string;
  /**
   * The scrolling body's id where `<testID>-body` is taken: the note editor's multiline
   * field has been `note-editor-body` since before the sheet, and a flow types into it.
   */
  bodyTestID?: string;
  /** The footer: handed to `FormActions` as it is. */
  actions: FormActionsProps;
  /** Who moves the form for the keyboard (see the header). Default `'form-sheet'`. */
  host?: FormSheetHost;
  /** What stands at the header's right ("Only you" on a private form); dropped at large text. */
  headerTrailing?: ReactNode;
  /** A line under the title (the note editor's sync state), centred with it. */
  headerSubtitle?: ReactNode;
  /**
   * A strip above the footer's buttons, inside the part that rides up with the keyboard (the
   * note editor's formatting bar). Opaque, like the footer.
   */
  footerAccessory?: ReactNode;
  /** The space between the fields, in dp. Default 16; New trip's roomier form passes 24. */
  gap?: number;
  /** A hairline above the footer (New trip draws one, Add expense none). */
  footerRule?: boolean;
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
export const SHEET_TOP_GAP = Space[4];
/** Room above and below the footer's buttons, and between a field and the footer. */
export const FOOTER_GAP = Space[4];
/** The side gutter of the body and the footer: the 20 dp screen margin (UI-SPEC 2.3, 3.6). */
const GUTTER = Space[5];
/** The header row's least height (the prototype's `.sheet-head`, 56). */
export const HEADER_MIN_HEIGHT = 56;
/** From this text scale the header drops its trailing chip so the title keeps its room. */
export const HEADER_BIG_TEXT = 1.5;
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
      className="self-center rounded-full bg-grab"
      style={styles.handle}
    />
  );
}

type HeaderProps = {
  parent?: string;
  title: string;
  actions: FormActionsProps;
  trailing?: ReactNode;
  subtitle?: ReactNode;
};

/**
 * Cancel at the left, the title centred, an optional chip at the right (`.sheet-head`: a
 * 1fr / auto / 1fr grid, 56 dp tall). From 1.5 times the text size the chip is dropped and
 * the title takes the room between Cancel and the edge (the prototype's `data-bigtext`).
 */
function Header({ parent, title, actions, trailing, subtitle }: HeaderProps) {
  const big = useFontScale() >= HEADER_BIG_TEXT;
  const heading = (
    <Text
      variant="callout"
      accessibilityRole="header"
      className={big ? 'shrink' : 'shrink text-center'}>
      {title}
    </Text>
  );
  const block = subtitle ? (
    <View className="shrink items-center">
      {heading}
      {subtitle}
    </View>
  ) : (
    heading
  );
  const cancel = <FormCancel {...actions} />;
  return (
    <View
      testID={parent ? `${parent}-header` : undefined}
      className="flex-row items-center"
      style={styles.header}>
      {big ? (
        <>
          {cancel}
          <View className="flex-1 items-center">{block}</View>
        </>
      ) : (
        <>
          <View className="flex-1 items-start">{cancel}</View>
          {block}
          <View className="flex-1 items-end">{trailing}</View>
        </>
      )}
    </View>
  );
}

type FooterProps = {
  parent?: string;
  host: FormSheetHost;
  bottomInset: number;
  rule: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  actions: FormActionsProps;
  accessory?: ReactNode;
};

/** Save on an opaque strip; a modal's rides the keyboard up (see the header). */
function Footer({
  parent,
  host,
  bottomInset,
  rule,
  onLayout,
  actions,
  accessory,
}: FooterProps) {
  const sticks = host === 'modal';
  const content = (
    <View
      className={rule ? 'border-t border-separator bg-background' : 'bg-background'}
      style={[
        styles.footer,
        accessory ? styles.footerWithAccessory : null,
        { paddingBottom: FOOTER_GAP + (sticks ? bottomInset : 0) },
      ]}>
      {accessory}
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
  bodyTestID,
  actions,
  host = 'form-sheet',
  headerTrailing,
  headerSubtitle,
  footerAccessory,
  gap = FOOTER_GAP,
  footerRule = false,
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
      <Header
        parent={testID}
        title={title}
        actions={actions}
        trailing={headerTrailing}
        subtitle={headerSubtitle}
      />
      <KeyboardAwareScrollView
        testID={bodyTestID ?? (testID ? `${testID}-body` : undefined)}
        keyboardShouldPersistTaps="handled"
        bottomOffset={footerHeight + FOOTER_GAP}
        style={inModal ? styles.bodyFill : styles.body}
        contentContainerStyle={[styles.bodyContent, { gap }]}>
        {children}
      </KeyboardAwareScrollView>
      <Footer
        parent={testID}
        host={host}
        bottomInset={insets?.bottom ?? 0}
        rule={footerRule}
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
        actions={actions}
        accessory={footerAccessory}
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
    paddingTop: Space[2],
    paddingBottom: FOOTER_GAP,
  },
  header: {
    minHeight: HEADER_MIN_HEIGHT,
    paddingHorizontal: Space[3],
    paddingTop: Space[2],
    gap: Space[2],
  },
  footer: { paddingHorizontal: GUTTER, paddingTop: Space[3] },
  footerWithAccessory: { gap: Space[2] },
  /** The Android sheet's own handle: 32 x 4 (the prototype's Android `.grab`). */
  handle: { width: 32, height: 4, marginTop: Space[3] },
});
