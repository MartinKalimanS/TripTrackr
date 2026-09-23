/**
 * T028–T030 — contract C3. THE gate that makes SC-002 standing rather than
 * one-off.
 *
 * Two properties matter more than any individual assertion:
 *
 *   1. It is EXHAUSTIVE over the token ramp. A token added without being
 *      classified fails the build rather than slipping through unmeasured.
 *   2. The shadow exemption is an explicit named allowlist, never a skipped
 *      assertion. Decorative tokens are exempt from WCAG 1.4.11 because they
 *      identify nothing — that is a documented decision (research R-002), not
 *      an assertion someone quietly commented out.
 */
import { Colors } from '@/constants/theme';
import { ContrastFloor, contrastRatio } from '@/theme/contrast';

type ThemeName = 'light' | 'dark';
const THEMES: ThemeName[] = ['light', 'dark'];

/** Backgrounds other tokens are measured against. Not measured against themselves. */
const SURFACE_TOKENS = ['canvas', 'surface', 'surfaceSunk'] as const;

/**
 * EXEMPT — decorative only (research R-002).
 *
 * These sit at 1.16–1.52:1 against their canvas and can never reach 3:1. They
 * carry no state and identify no control, so WCAG 1.4.11 does not apply. This
 * is why interactive elements carry a border instead.
 */
const DECORATIVE_EXEMPT = ['shadowLight', 'shadowDark'] as const;

/** Tokens used as text on a surface — FR-008, 4.5:1. */
const TEXT_TOKENS = ['textPrimary', 'textMuted', 'accent', 'danger'] as const;

/** Tokens identifying a control or boundary — FR-009, 3:1. */
const NON_TEXT_TOKENS = ['border', 'borderStrong'] as const;

/** Measured against the accent fill they sit on rather than against the canvas. */
const ON_ACCENT_TOKENS = ['accentInk'] as const;

/** Pre-existing scaffold tokens, kept until every consumer is migrated. */
const LEGACY_TOKENS = [
  'text',
  'background',
  'backgroundElement',
  'backgroundSelected',
  'textSecondary',
] as const;

describe('contrast gate — contract C3', () => {
  describe.each(THEMES)('%s theme', (theme) => {
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

    test.each(DECORATIVE_EXEMPT)(
      '%s is exempt, and is confirmed to be decorative rather than quietly failing',
      (token) => {
        // Asserting the exemption is CORRECT, not merely convenient: if a shadow
        // tone ever cleared 3:1 it would be doing identification work, and the
        // border decision would need revisiting rather than silently persisting.
        expect(contrastRatio(palette[token], palette.canvas)).toBeLessThan(
          ContrastFloor.nonText,
        );
      },
    );

    test.each(LEGACY_TOKENS.filter((t) => t.startsWith('text')))(
      'legacy %s still meets the normal-text floor',
      (token) => {
        const backgrounds = [
          'background',
          'backgroundElement',
          'backgroundSelected',
        ] as const;
        for (const background of backgrounds) {
          expect(
            contrastRatio(palette[token], palette[background]),
          ).toBeGreaterThanOrEqual(ContrastFloor.normalText);
        }
      },
    );

    test('increased contrast raises text to the 7:1 floor (FR-013)', () => {
      // Under increased contrast the primary ink must clear AAA. Muted text is
      // deliberately excluded: FR-013 is satisfied by promoting muted text to
      // primary at render time, not by darkening a token past its design intent.
      expect(contrastRatio(palette.textPrimary, palette.canvas)).toBeGreaterThanOrEqual(
        ContrastFloor.increasedContrast,
      );
    });
  });

  describe('exhaustiveness — a new token cannot slip through unmeasured', () => {
    const CLASSIFIED = new Set<string>([
      ...SURFACE_TOKENS,
      ...DECORATIVE_EXEMPT,
      ...TEXT_TOKENS,
      ...NON_TEXT_TOKENS,
      ...ON_ACCENT_TOKENS,
      ...LEGACY_TOKENS,
    ]);

    test.each(THEMES)('every %s token is classified', (theme) => {
      const unclassified = Object.keys(Colors[theme]).filter(
        (token) => !CLASSIFIED.has(token),
      );
      expect(unclassified).toEqual([]);
    });

    test('both themes expose exactly the same token names', () => {
      expect(Object.keys(Colors.light).sort()).toEqual(Object.keys(Colors.dark).sort());
    });
  });
});
