/**
 * Feature 005, F12: the Jest stand-in for `expo-apple-authentication` is held to the contract
 * of the real package (`test/mocks/expo-apple-authentication.tsx`). The enum values come from
 * the package's own `build/AppleAuthentication.types.js`, so a drift in the stand-in (or in a
 * later SDK) fails here and not on a device.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

const real = jest.requireActual(
  'expo-apple-authentication/build/AppleAuthentication.types',
) as typeof AppleAuthentication;

describe('expo-apple-authentication stand-in', () => {
  test('the button types, styles and scopes have the real package values', () => {
    expect(AppleAuthentication.AppleAuthenticationButtonType).toEqual({
      SIGN_IN: real.AppleAuthenticationButtonType.SIGN_IN,
      CONTINUE: real.AppleAuthenticationButtonType.CONTINUE,
      SIGN_UP: real.AppleAuthenticationButtonType.SIGN_UP,
    });
    expect(AppleAuthentication.AppleAuthenticationButtonStyle).toEqual({
      WHITE: real.AppleAuthenticationButtonStyle.WHITE,
      WHITE_OUTLINE: real.AppleAuthenticationButtonStyle.WHITE_OUTLINE,
      BLACK: real.AppleAuthenticationButtonStyle.BLACK,
    });
    expect(AppleAuthentication.AppleAuthenticationScope).toEqual({
      FULL_NAME: real.AppleAuthenticationScope.FULL_NAME,
      EMAIL: real.AppleAuthenticationScope.EMAIL,
    });
  });

  test('the documented values: SIGN_IN 0, CONTINUE 1, SIGN_UP 2; WHITE 0, WHITE_OUTLINE 1, BLACK 2', () => {
    const { AppleAuthenticationButtonType: type, AppleAuthenticationButtonStyle: style } =
      AppleAuthentication;
    expect([type.SIGN_IN, type.CONTINUE, type.SIGN_UP]).toEqual([0, 1, 2]);
    expect([style.WHITE, style.WHITE_OUTLINE, style.BLACK]).toEqual([0, 1, 2]);
  });

  test('the button is a pressable host that carries the props the app sets and the system title', async () => {
    const press = jest.fn();
    const {
      AppleAuthenticationButton,
      AppleAuthenticationButtonType,
      AppleAuthenticationButtonStyle,
    } = AppleAuthentication;
    const titles = [
      [AppleAuthenticationButtonType.SIGN_IN, 'Sign in with Apple'],
      [AppleAuthenticationButtonType.CONTINUE, 'Continue with Apple'],
      [AppleAuthenticationButtonType.SIGN_UP, 'Sign up with Apple'],
    ] as const;
    for (const [buttonType, title] of titles) {
      const { unmount } = await render(
        <AppleAuthenticationButton
          testID="apple"
          buttonType={buttonType}
          buttonStyle={AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={26}
          style={{ height: 52 }}
          onPress={press}
        />,
      );
      const button = screen.getByTestId('apple');
      expect(button.props).toMatchObject({
        buttonType,
        buttonStyle: AppleAuthenticationButtonStyle.BLACK,
        cornerRadius: 26,
        accessibilityRole: 'button',
        accessibilityLabel: title,
      });
      await fireEvent.press(button);
      await unmount();
    }
    expect(press).toHaveBeenCalledTimes(3);
  });

  test('the device can sign in with Apple by default, and the sheet is a bare jest.fn', async () => {
    await expect(AppleAuthentication.isAvailableAsync()).resolves.toBe(true);
    expect(jest.isMockFunction(AppleAuthentication.signInAsync)).toBe(true);
  });
});
