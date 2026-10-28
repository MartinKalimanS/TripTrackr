/**
 * The render helpers of the appearance sweep (feature 005, T562; not a test file).
 *
 * A screen is painted in a theme and under the two accessibility flags by the same mechanism
 * the dev gallery uses: `AppearanceScope` (T524) provides the appearance override, so the REAL
 * `useAppearance`, `useAccessibilityFlags` and `useColorScheme` answer for the scope and a
 * change of its props is a LIVE change on a mounted tree. The kit's `useThemeColor` is
 * answered from the generated stylesheet in the theme of the nearest Uniwind scope (the suite
 * stand-in answers one grey), so a colour a screen gets from `useColors` is the real token
 * of the theme it is painted in.
 *
 *   installThemeAwareKit();                        // in beforeEach
 *   await renderIn(<Screen />, { theme: 'dark-contrast' });
 *   expect(auditNow({ theme: 'dark-contrast', opaque: true })).toEqual([]);
 */
import { act, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import type { ReactElement } from 'react';
import { useUniwind } from 'uniwind';

import { AppearanceScope } from '@/components/ui/appearance-scope';
import type { PaletteName } from '@/theme';

import { audit, describeFindings, type Finding, type HostNode } from './audit';
import { themeColour } from './colours';

export interface Setup {
  theme: PaletteName;
  reduceMotion?: boolean;
  reduceTransparency?: boolean;
}

export const THEMES: readonly PaletteName[] = [
  'light',
  'dark',
  'light-contrast',
  'dark-contrast',
];
export const BASE_THEMES = ['light', 'dark'] as const;
export const CONTRAST_THEMES = ['light-contrast', 'dark-contrast'] as const;

/** `useThemeColor` answers with the real token of the theme the nearest scope paints. */
export function installThemeAwareKit(): void {
  jest.spyOn(HeroUI, 'useThemeColor').mockImplementation(((token: string | string[]) => {
    const { theme } = useUniwind();
    const read = (name: string) => themeColour(theme as PaletteName, name);
    return Array.isArray(token) ? token.map(read) : read(token);
  }) as never);
}

export function Scoped({
  setup,
  children,
}: {
  setup: Setup;
  children: ReactElement;
}): ReactElement {
  return (
    <AppearanceScope
      theme={setup.theme}
      fontScale={1}
      reduceMotion={setup.reduceMotion ?? false}
      reduceTransparency={setup.reduceTransparency ?? false}>
      {children}
    </AppearanceScope>
  );
}

/** Renders `element` inside a scope; returns the render result so a test can `rerender`. */
export async function renderIn(element: ReactElement, setup: Setup) {
  return render(<Scoped setup={setup}>{element}</Scoped>);
}

/** The host tree on screen now, in the shape the audit and the motion reader take. */
export const treeNow = () => screen.toJSON() as unknown as HostNode | HostNode[] | null;

/** The audit of what is on screen now. */
export function auditNow(options: { theme: PaletteName; opaque: boolean }): Finding[] {
  return audit(treeNow(), options);
}

/** The findings as lines, so a failing `toEqual([])` prints what is wrong and where. */
export const linesOf = (findings: readonly Finding[]): string[] =>
  describeFindings(findings);

/**
 * The appearance matrix of one screen (T562): the four themes (it renders without a thrown
 * error, with token colours only, and in the two contrast themes with nothing translucent) and
 * the two normal themes under reduced transparency (nothing translucent either).
 *
 * `build` makes the element; `prepare` puts the screen's mocked world in its state and
 * runs before every render; `settle` runs after it (a layout event a screen waits for).
 */
export function sweepScreen(
  label: string,
  build: () => ReactElement,
  prepare: () => void | Promise<void> = () => undefined,
  settle: () => void | Promise<void> = () => undefined,
): void {
  describe(`${label} - appearance`, () => {
    beforeEach(async () => {
      installThemeAwareKit();
      await prepare();
    });
    afterEach(() => jest.restoreAllMocks());

    test.each(THEMES)(
      '%s: renders with token colours only, and opaque in the contrast themes',
      async (theme) => {
        await renderIn(build(), { theme });
        await settle();
        await act(async () => undefined);
        const opaque = theme.endsWith('-contrast');
        expect(linesOf(auditNow({ theme, opaque }))).toEqual([]);
      },
    );

    test.each(BASE_THEMES)(
      '%s with reduced transparency: nothing translucent is drawn',
      async (theme) => {
        await renderIn(build(), { theme, reduceTransparency: true });
        await settle();
        await act(async () => undefined);
        expect(linesOf(auditNow({ theme, opaque: true }))).toEqual([]);
      },
    );
  });
}
