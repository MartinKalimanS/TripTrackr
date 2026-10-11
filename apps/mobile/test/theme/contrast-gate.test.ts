/**
 * T028–T030 — contract C3. THE gate that makes SC-002 standing rather than
 * one-off.
 *
 * It is EXHAUSTIVE over the tokens: a token added without being classified fails the
 * build rather than slipping through unmeasured.
 *
 * Feature 004 (T453): `Colors` is the set of colours that code, not a class, hands over
 * (the root and tab scenes, the navigation theme, the canvas of `Screen`, `MediaFrame`'s
 * edge), read from the Atlas palette of each of the FOUR themes, increased contrast
 * included. This gate measures those. The gate for the palette itself, with every pairing
 * of every class, is `palette-gate.test.ts`; the decorative hairline (`separator`) is
 * exempt there, by name.
 */
import { Colors } from '@/constants/theme';
import { ContrastFloor, contrastRatio } from '@/theme/contrast';
import { PaletteNames } from '@/theme/palette';

/** Backgrounds other tokens are measured against. Not measured against themselves. */
const SURFACE_TOKENS = ['canvas', 'surface'] as const;

/** Tokens used as text on a surface — FR-008, 4.5:1. */
const TEXT_TOKENS = ['textPrimary', 'textMuted', 'accent', 'danger'] as const;

/** Tokens identifying a control or boundary — FR-009, 3:1. */
const NON_TEXT_TOKENS = ['border'] as const;

/** Measured against the accent fill they sit on rather than against the canvas. */
const ON_ACCENT_TOKENS = ['accentInk'] as const;

describe('contrast gate — contract C3', () => {
  describe.each(PaletteNames)('%s theme', (theme) => {
    const palette = Colors[theme];

    test.each(TEXT_TOKENS)(
      '%s meets the 4.5:1 normal-text floor on every surface',
      (token) => {
        for (const surface of SURFACE_TOKENS) {
          const ratio = contrastRatio(palette[token], palette[surface]);
          expect({ token, surface, ratio: Number(ratio.toFixed(2)) }).toMatchObject({
            ratio: expect.any(Number),
          });
          expect(ratio).toBeGreaterThanOrEqual(ContrastFloor.normalText);
        }
      },
    );

    test.each(NON_TEXT_TOKENS)(
      '%s meets the 3:1 non-text floor on every surface',
      (token) => {
        for (const surface of SURFACE_TOKENS) {
          expect(contrastRatio(palette[token], palette[surface])).toBeGreaterThanOrEqual(
            ContrastFloor.nonText,
          );
        }
      },
    );

    test.each(ON_ACCENT_TOKENS)(
      '%s meets the 4.5:1 floor against the accent fill',
      (token) => {
        expect(contrastRatio(palette[token], palette.accent)).toBeGreaterThanOrEqual(
          ContrastFloor.normalText,
        );
      },
    );

    test('the focus indicator meets the 3:1 floor (FR-012)', () => {
      // The focus ring is drawn in the accent tone; it must be findable against
      // the surface it rings, independently of the press depth.
      for (const surface of SURFACE_TOKENS) {
        expect(contrastRatio(palette.accent, palette[surface])).toBeGreaterThanOrEqual(
          ContrastFloor.nonText,
        );
      }
    });

    test('the primary ink clears the 7:1 floor on the canvas (FR-013)', () => {
      // AAA for the primary ink in every theme. Muted text is held to 7:1 in the
      // increased-contrast themes by `palette-gate.test.ts`, where each palette carries
      // its own muted tone, rather than by darkening a base-theme token past its intent.
      expect(contrastRatio(palette.textPrimary, palette.canvas)).toBeGreaterThanOrEqual(
        ContrastFloor.increasedContrast,
      );
    });
  });

  describe('exhaustiveness — a new token cannot slip through unmeasured', () => {
    const CLASSIFIED = new Set<string>([
      ...SURFACE_TOKENS,
      ...TEXT_TOKENS,
      ...NON_TEXT_TOKENS,
      ...ON_ACCENT_TOKENS,
    ]);

    test.each(PaletteNames)('every %s token is classified', (theme) => {
      const unclassified = Object.keys(Colors[theme]).filter(
        (token) => !CLASSIFIED.has(token),
      );
      expect(unclassified).toEqual([]);
    });

    test('all four themes expose exactly the same token names', () => {
      const reference = Object.keys(Colors.light).sort();
      for (const theme of PaletteNames) {
        expect(Object.keys(Colors[theme]).sort()).toEqual(reference);
      }
    });
  });
});
