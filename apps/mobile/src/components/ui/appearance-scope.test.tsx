/**
 * Feature 005, T524 (research D5-18): `AppearanceScope` paints a subtree in another theme and at
 * another text scale, which is how the dev gallery shows every adapter in the four themes at
 * scale 1 and 2 on one device.
 *
 * A scope does two things. It provides the appearance override (`hooks/appearance-override.ts`),
 * so `useAppearance`, the lift and every adapter that reads the scale follow, and it wraps the
 * subtree in Uniwind's `ScopedTheme`, so the classes and `useCSSVariable` resolve in that
 * theme. Nothing outside the scope changes, and a scope inside a scope inherits what it does
 * not set.
 */
import { render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { useUniwind } from 'uniwind';

import { Colors, MinTouchTarget } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { PaletteNames, type PaletteName } from '@/theme';

import { AppearanceScope } from './appearance-scope';
import { AreaPill } from './area-pill';
import { Button } from './button';
import { Tappable } from './tappable';
import { Text } from './text';

/** Writes what a component below the scope reads, as one line a test can find. */
function Probe({ testID }: { testID: string }) {
  const appearance = useAppearance();
  const { theme } = useUniwind();
  return (
    <Text testID={testID}>
      {[
        appearance.themeName,
        appearance.theme,
        appearance.prefersMoreContrast,
        appearance.prefersLessMotion,
        appearance.prefersLessTransparency,
        appearance.fontScale,
        theme,
      ].join('|')}
    </Text>
  );
}

const read = (testID: string) => screen.getByTestId(testID).props.children as string;

/** The window's font scale, which Jest sets to 2 unless a test says otherwise. */
function deviceFontScale(fontScale: number) {
  jest
    .spyOn(Dimensions, 'get')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('<AppearanceScope> - the four themes', () => {
  test.each(PaletteNames.map((name) => [name]))(
    '%s: the appearance, the tokens and the Uniwind theme agree',
    async (name: PaletteName) => {
      await render(
        <AppearanceScope theme={name} fontScale={1}>
          <Probe testID="probe" />
        </AppearanceScope>,
      );
      const scheme = name.startsWith('dark') ? 'dark' : 'light';
      const contrast = name.endsWith('-contrast');
      expect(read('probe')).toBe(
        [name, scheme, contrast, false, false, 1, name].join('|'),
      );
    },
  );

  test('the tokens are those of the scoped theme', async () => {
    function Tokens() {
      const { tokens } = useAppearance();
      return <Text testID="tokens">{`${tokens.canvas}|${tokens.accent}`}</Text>;
    }
    await render(
      <AppearanceScope theme="dark-contrast">
        <Tokens />
      </AppearanceScope>,
    );
    const { canvas, accent } = Colors['dark-contrast'];
    expect(read('tokens')).toBe(`${canvas}|${accent}`);
    expect(canvas).not.toBe(Colors.light.canvas);
  });
});

describe('<AppearanceScope> - the text scale', () => {
  test('the scale reaches useAppearance', async () => {
    await render(
      <AppearanceScope theme="light" fontScale={2}>
        <Probe testID="probe" />
      </AppearanceScope>,
    );
    expect(read('probe').split('|')[5]).toBe('2');
  });

  test('a Button, a Tappable and an AreaPill grow as the text does (a minimum, never fixed)', async () => {
    deviceFontScale(1);
    await render(
      <AppearanceScope theme="light" fontScale={2}>
        <Button accessibilityLabel="Save" testID="scaled-button">
          Save
        </Button>
        <Tappable accessibilityLabel="Open" testID="scaled-tappable">
          <Text>Open</Text>
        </Tappable>
        <AreaPill
          icon="images"
          label="Photos"
          count={1}
          onPress={jest.fn()}
          testID="scaled-pill"
        />
      </AppearanceScope>,
    );
    const minHeight = (testID: string) =>
      (
        StyleSheet.flatten(screen.getByTestId(testID).props.style) as {
          minHeight: number;
        }
      ).minHeight;
    expect(minHeight('scaled-button')).toBe(MinTouchTarget * 2);
    expect(minHeight('scaled-tappable')).toBe(MinTouchTarget * 2);
    expect(minHeight('scaled-pill')).toBe(MinTouchTarget * 2);
  });

  test('outside a scope they keep the device scale', async () => {
    deviceFontScale(1.5);
    await render(
      <Button accessibilityLabel="Save" testID="plain-button">
        Save
      </Button>,
    );
    const style = StyleSheet.flatten(screen.getByTestId('plain-button').props.style) as {
      minHeight: number;
    };
    expect(style.minHeight).toBe(Math.max(52, MinTouchTarget * 1.5));
  });
});

describe('<AppearanceScope> - the flags', () => {
  test('reduced motion and reduced transparency are set by the scope', async () => {
    await render(
      <AppearanceScope theme="light" reduceMotion reduceTransparency>
        <Probe testID="probe" />
      </AppearanceScope>,
    );
    const [, , , motion, transparency] = read('probe').split('|');
    expect([motion, transparency]).toEqual(['true', 'true']);
  });
});

describe('<AppearanceScope> - nesting', () => {
  test('an inner scope inherits the theme and the scale it does not set', async () => {
    await render(
      <AppearanceScope theme="dark-contrast" fontScale={2}>
        <AppearanceScope reduceTransparency>
          <Probe testID="inner" />
        </AppearanceScope>
        <Probe testID="outer" />
      </AppearanceScope>,
    );
    expect(read('inner')).toBe(
      ['dark-contrast', 'dark', true, false, true, 2, 'dark-contrast'].join('|'),
    );
    expect(read('outer')).toBe(
      ['dark-contrast', 'dark', true, false, false, 2, 'dark-contrast'].join('|'),
    );
  });

  test('an inner scope may change the theme', async () => {
    await render(
      <AppearanceScope theme="dark" fontScale={2}>
        <AppearanceScope theme="light-contrast">
          <Probe testID="inner" />
        </AppearanceScope>
      </AppearanceScope>,
    );
    expect(read('inner')).toBe(
      ['light-contrast', 'light', true, false, false, 2, 'light-contrast'].join('|'),
    );
  });
});

describe('outside every scope', () => {
  test('nothing changes: the device appearance, and no scoped Uniwind theme', async () => {
    await render(<Probe testID="probe" />);
    const [themeName, theme, contrast, , , scale, uniwind] = read('probe').split('|');
    expect(themeName).toBe('light');
    expect(theme).toBe('light');
    expect(contrast).toBe('false');
    expect(Number(scale)).toBeGreaterThan(0);
    expect(uniwind).toBe('light');
  });
});
