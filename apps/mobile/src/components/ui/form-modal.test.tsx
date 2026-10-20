/**
 * `FormModal` - the React Native Modal under the stop editor and the note editor (feature 004;
 * contract C4-8, C4-10 rules 5 and 8; FR-009, FR-022; research D4-06).
 *
 * Jest renders no sheet. What is asserted is every instruction the code gives the platform:
 * the Modal's props, the handle it draws (iOS only), the inset it pads (Android only) and that
 * the caller's form is what is inside. How the sheet looks and swipes is a device check
 * (tasks.md T437, T438).
 */
import { act, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { __resetAppearanceStoreForTests } from '@/hooks/appearance-store';

import { FormModal } from './form-modal';

const INSETS = { top: 24, bottom: 34, left: 0, right: 0 };
const hidden = { includeHiddenElements: true };

const flat = (testID: string) =>
  (StyleSheet.flatten(screen.getByTestId(testID, hidden).props.style) ?? {}) as Record<
    string,
    unknown
  >;

afterEach(() => __resetAppearanceStoreForTests());

async function renderModal(onRequestClose: () => void = jest.fn(), visible = true) {
  return render(
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <FormModal testID="sheet" visible={visible} onRequestClose={onRequestClose}>
        <NativeText>inside</NativeText>
      </FormModal>
    </SafeAreaInsetsContext.Provider>,
  );
}

describe('<FormModal> - the Modal', () => {
  test('is a page sheet that a swipe down or Back dismisses through onRequestClose', async () => {
    const onRequestClose = jest.fn();
    await renderModal(onRequestClose);

    const modal = screen.getByTestId('sheet-modal', hidden);
    expect(modal.props).toMatchObject({
      visible: true,
      presentationStyle: 'pageSheet',
      animationType: 'slide',
      allowSwipeDismissal: true,
    });
    modal.props.onRequestClose();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  test('takes no translucent-bar props: the edge-to-edge Modal reports both bars translucent anyway', async () => {
    await renderModal();

    const { props } = screen.getByTestId('sheet-modal', hidden);
    expect(props.statusBarTranslucent).toBeUndefined();
    expect(props.navigationBarTranslucent).toBeUndefined();
  });

  test('with reduced motion it does not slide in (feature 002 FR-015)', async () => {
    const reduced = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    await renderModal();
    await act(async () => undefined);

    expect(screen.getByTestId('sheet-modal', hidden).props.animationType).toBe('none');
    reduced.mockRestore();
  });

  test('holds what the caller gives it while visible, and nothing while hidden', async () => {
    const view = await renderModal();
    expect(screen.getByText('inside', hidden)).toBeTruthy();
    await view.unmount();

    await renderModal(jest.fn(), false);
    expect(screen.queryByText('inside', hidden)).toBeNull();
  });
});

describe('<FormModal> - the frame', () => {
  test('is the canvas, filling the Modal', async () => {
    await renderModal();

    expect(screen.getByTestId('sheet-frame', hidden).props.className).toBe(
      'flex-1 bg-background',
    );
  });

  test('draws a handle on iOS, where a page sheet has none of its own, hidden from assistive technology', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    await renderModal();
    os.restore();

    const handle = screen.getByTestId('sheet-handle', hidden);
    expect(handle.props.accessibilityElementsHidden).toBe(true);
    expect(handle.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(handle.props.accessible).not.toBe(true);
  });

  test('draws none on Android: the Modal is a full-screen dialog there, with nothing to drag', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    await renderModal();
    os.restore();

    expect(screen.queryByTestId('sheet-handle', hidden)).toBeNull();
  });

  test('pads the status bar on Android, where the Modal draws under it, and nothing on iOS', async () => {
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    const first = await renderModal();
    android.restore();
    expect(flat('sheet-frame').paddingTop).toBe(INSETS.top);
    await first.unmount();

    const ios = jest.replaceProperty(Platform, 'OS', 'ios');
    await renderModal();
    ios.restore();
    expect(flat('sheet-frame').paddingTop).toBe(0);
  });

  test('without a safe-area provider the inset is 0, not a crash', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    await render(
      <FormModal testID="bare" visible onRequestClose={jest.fn()}>
        <NativeText>inside</NativeText>
      </FormModal>,
    );
    os.restore();

    expect(flat('bare-frame').paddingTop).toBe(0);
  });

  test('names every id after the prefix it is given', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    await render(
      <FormModal testID="other" visible onRequestClose={jest.fn()}>
        <NativeText>inside</NativeText>
      </FormModal>,
    );
    os.restore();

    for (const id of ['other-modal', 'other-frame', 'other-handle']) {
      expect(screen.getByTestId(id, hidden)).toBeTruthy();
    }
  });
});

describe('<FormModal> - source', () => {
  const source = readFileSync(require.resolve('./form-modal'), 'utf8');

  test('has no colour literal and imports neither the kit nor the retired primitives', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
    expect(source).not.toMatch(/Surface|ThemedView|ThemedText/);
  });
});
