/**
 * `AppleOfficialButton` - Sign in with Apple drawn by Apple (F12; owner decision 2026-10-22,
 * `docs/roadmap/DECISIONS.md`: Apple's own button wherever the Apple logo is drawn, never a
 * hand-made or icon-font glyph).
 *
 * Facts this suite pins, verified in `reference/as-built/f12-apple.md`:
 * - the native `AppleAuthenticationButton` (iOS `ASAuthorizationAppleIDButton`) draws Apple's
 *   logo and its localised title; the app chooses only the type (`SIGN_IN`, `SIGN_UP`,
 *   `CONTINUE`), one of Apple's three styles (`WHITE`, `WHITE_OUTLINE`, `BLACK`), the corner
 *   radius and the frame; `backgroundColor` and `borderRadius` in `style` are against the App
 *   Store Guidelines and do not work;
 * - HIG: white on dark grounds, black on light grounds, white-with-outline only on a light
 *   ground that gives a white fill too little contrast (and never on a dark or saturated one);
 *   at least 140 x 30 pt, with a margin of 1/10 of the button's height around it;
 * - the button is as tall as the Google pill beside it (one shared minimum that grows with the
 *   text size) and as wide (it stretches the column).
 *
 * Jest has no pixels: the props handed to the native view are what is asserted. The look at text
 * scales 1.5 and 2, in the dark and in increased contrast is a device check.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { ContrastFloor, Space, contrastRatio, type PaletteName } from '@/theme';

import { appearanceOf } from '../../../../test/helpers/appearance';
import {
  APPLE_TITLE,
  AppleOfficialButton,
  appleButtonStyleFor,
  type AppleIntent,
} from '../apple-official-button';
import { PILL_MIN_HEIGHT, pillMinHeight } from '../pill-button';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

const { AppleAuthenticationButtonStyle: Style, AppleAuthenticationButtonType: Type } =
  AppleAuthentication;

const THEMES: readonly PaletteName[] = [
  'light',
  'dark',
  'light-contrast',
  'dark-contrast',
];
const SCALES = [1, 1.15, 1.5, 2] as const;
const INTENTS: readonly [AppleIntent, number, string][] = [
  ['sign-in', Type.SIGN_IN, 'Sign in with Apple'],
  ['sign-up', Type.SIGN_UP, 'Sign up with Apple'],
  ['continue', Type.CONTINUE, 'Continue with Apple'],
];

const press = jest.fn();
beforeEach(() => {
  press.mockReset();
  useAppearance.mockReturnValue(appearanceOf('light'));
});

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
const native = () => screen.getByTestId('apple-sign-in');

describe('<AppleOfficialButton> - Apple draws it', () => {
  test('is the native Apple button, with the id the Apple button always had', async () => {
    await render(<AppleOfficialButton intent="continue" onPress={press} />);
    expect(native().props.buttonType).toBeDefined();
    expect(native().props.buttonStyle).toBeDefined();
    expect(screen.getAllByTestId('apple-sign-in')).toHaveLength(1);
  });

  test.each(INTENTS)(
    '%s asks Apple for its button type %i and the system reads "%s"',
    async (intent, buttonType, title) => {
      await render(<AppleOfficialButton intent={intent} onPress={press} />);
      expect(native().props.buttonType).toBe(buttonType);
      expect(native().props.accessibilityLabel).toBe(title);
      expect(APPLE_TITLE[intent]).toBe(title);
    },
  );

  test('draws no logo, text or colour of its own inside the frame', async () => {
    await render(<AppleOfficialButton intent="continue" onPress={press} />);
    expect(screen.queryByText(/Apple/)).toBeNull();
    expect(
      screen.queryByTestId('brand-glyph', { includeHiddenElements: true }),
    ).toBeNull();
    expect(native().children).toHaveLength(0);
  });

  test('never sets a background or a border radius in style (against the Guidelines), only the frame', async () => {
    await render(<AppleOfficialButton intent="continue" onPress={press} />);
    const style = flat(native().props.style);
    expect(Object.keys(style).sort()).toEqual(['alignSelf', 'height']);
    expect(style).not.toHaveProperty('backgroundColor');
    expect(style).not.toHaveProperty('borderRadius');
  });

  test('a press is the screen\u2019s press, once', async () => {
    await render(<AppleOfficialButton intent="sign-in" onPress={press} />);
    await fireEvent.press(native());
    expect(press).toHaveBeenCalledTimes(1);
  });
});

describe('<AppleOfficialButton> - the style follows the ground (HIG, "Displaying buttons")', () => {
  test.each(THEMES)(
    '%s: black on light grounds, white on dark ones, never the outlined white',
    async (themeName) => {
      useAppearance.mockReturnValue(appearanceOf(themeName));
      await render(<AppleOfficialButton intent="continue" onPress={press} />);
      const dark = themeName.startsWith('dark');
      expect(native().props.buttonStyle).toBe(dark ? Style.WHITE : Style.BLACK);
      expect(native().props.buttonStyle).not.toBe(Style.WHITE_OUTLINE);
      expect(appleButtonStyleFor(themeName)).toBe(dark ? Style.WHITE : Style.BLACK);
    },
  );

  test.each(THEMES)(
    '%s: the fill clears 3:1 against the canvas and the sheet it sits on, so no outline is needed',
    async (themeName) => {
      const { tokens } = appearanceOf(themeName);
      const fill = appleButtonStyleFor(themeName) === Style.BLACK ? '#000000' : '#FFFFFF';
      for (const ground of [tokens.canvas, tokens.surface]) {
        expect(contrastRatio(fill, ground)).toBeGreaterThanOrEqual(ContrastFloor.nonText);
      }
    },
  );

  test('the style follows the theme when it changes with the screen open', async () => {
    const { rerender } = await render(
      <AppleOfficialButton intent="continue" onPress={press} />,
    );
    expect(native().props.buttonStyle).toBe(Style.BLACK);
    useAppearance.mockReturnValue(appearanceOf('dark'));
    await rerender(<AppleOfficialButton intent="continue" onPress={press} />);
    expect(native().props.buttonStyle).toBe(Style.WHITE);
  });
});

describe('<AppleOfficialButton> - size, shape and margin (HIG, "Button size and corner radius")', () => {
  test.each(SCALES)(
    'at text scale %s it is as tall as the Google pill, a capsule, and far above Apple\u2019s 30 pt',
    async (fontScale) => {
      useAppearance.mockReturnValue(appearanceOf('light', { fontScale }));
      await render(<AppleOfficialButton intent="continue" onPress={press} />);
      const { height } = flat(native().props.style) as { height: number };
      expect(height).toBe(pillMinHeight(fontScale));
      expect(height).toBe(Math.max(PILL_MIN_HEIGHT, MinTouchTarget * fontScale));
      expect(height).toBeGreaterThanOrEqual(30);
      expect(native().props.cornerRadius).toBe(height / 2);
    },
  );

  test('spans the column like the Google pill (self-stretch), so it is wider than Apple\u2019s 140 pt', async () => {
    await render(<AppleOfficialButton intent="continue" onPress={press} />);
    const style = flat(native().props.style);
    expect(style.alignSelf).toBe('stretch');
    expect(style).not.toHaveProperty('width');
  });

  test.each(SCALES)(
    'at text scale %s the 12 dp gap between the buttons is at least a tenth of the height',
    (fontScale) => {
      expect(Space[3]).toBeGreaterThanOrEqual(pillMinHeight(fontScale) / 10);
    },
  );
});

describe('<AppleOfficialButton> - busy and disabled (the Tappable contract)', () => {
  test('free: the frame is not an accessibility element, so VoiceOver reads Apple\u2019s own title', async () => {
    await render(<AppleOfficialButton intent="continue" onPress={press} />);
    const frame = screen.getByTestId('apple-sign-in-frame');
    expect(frame.props.accessible).toBe(false);
    expect(frame.props.accessibilityState).toBeUndefined();
    expect(frame.props.pointerEvents).toBe('auto');
  });

  test('busy: inert, announced busy and unavailable, under its title, and not dimmed', async () => {
    await render(<AppleOfficialButton intent="sign-up" onPress={press} busy />);
    const frame = screen.getByTestId('apple-sign-in-frame');
    expect(frame.props).toMatchObject({
      accessible: true,
      accessibilityRole: 'button',
      accessibilityLabel: 'Sign up with Apple',
      accessibilityState: { busy: true, disabled: true },
      pointerEvents: 'none',
    });
    expect(String(frame.props.className ?? '')).not.toContain('opacity-disabled');
    await fireEvent.press(native());
    expect(press).not.toHaveBeenCalled();
  });

  test('disabled: inert, announced unavailable and dimmed with the kit\u2019s disabled opacity', async () => {
    await render(<AppleOfficialButton intent="sign-in" onPress={press} disabled />);
    const frame = screen.getByTestId('apple-sign-in-frame');
    expect(frame.props).toMatchObject({
      accessible: true,
      accessibilityLabel: 'Sign in with Apple',
      accessibilityState: { busy: false, disabled: true },
      pointerEvents: 'none',
    });
    expect(String(frame.props.className)).toContain('opacity-disabled');
    await fireEvent.press(native());
    expect(press).not.toHaveBeenCalled();
  });

  test('going busy and free again keeps the same native button (no remount, no flash)', async () => {
    const { rerender } = await render(
      <AppleOfficialButton intent="continue" onPress={press} />,
    );
    const before = native();
    await rerender(<AppleOfficialButton intent="continue" onPress={press} busy />);
    expect(native()).toBe(before);
    await rerender(<AppleOfficialButton intent="continue" onPress={press} />);
    expect(native()).toBe(before);
  });
});
