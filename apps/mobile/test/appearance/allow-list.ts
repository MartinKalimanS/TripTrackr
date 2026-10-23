/**
 * The documented exceptions of the appearance sweep (feature 005, T562; FR-072, FR-073,
 * SC-008; not a test file). The sweep (`audit.ts`) fails on a translucent surface in the
 * contrast themes and under reduced transparency, and on a raw colour in a rendered style. An
 * exception is allowed only when it is named here WITH its reason, so a new translucent fill
 * cannot slip in as "probably a scrim": it has to be added to this file, in review.
 *
 * Two kinds, and nothing else:
 *
 * - `TRANSLUCENT`: a palette TOKEN that is translucent by design and may be drawn as a
 *   background. The match is on the token's own value in the theme being painted, so a
 *   different translucent fill of the same colour family is still a finding.
 * - `LITERAL`: a colour a rendered style may carry that is not a token of the theme: the two
 *   sign-in providers' own button colours, which the providers' brand rules fix.
 *
 * Shadows are not here: a `boxShadow` is checked against the `Lift` tokens
 * (`test/theme/shape.test.ts` pins them), and a shadow is drawn BEHIND a surface, never as one.
 */
import { Palettes, type Palette, type PaletteName } from '@/theme';
import { AppleButton, GoogleButton, GoogleG } from '@/theme/brand-artwork';

export interface TranslucentException {
  /** The palette token whose (translucent) value may be a background. */
  token: keyof Palette;
  /** The longest side, in dp, a node may have: a rule or a handle is a line, not a surface. */
  lineOnly?: number;
  reason: string;
}

export const TRANSLUCENT: readonly TranslucentException[] = [
  {
    token: 'scrimButton',
    reason:
      'A control disc over a photograph (the glass Back, the sync badge on a tile, the ' +
      'photo-tile veil). It is the scrim the photograph needs for its white glyph (M-5) and ' +
      'is darker in the contrast themes; it never carries text over a screen surface.',
  },
  {
    token: 'backdrop',
    reason:
      'The dim behind a modal sheet or a viewer: a scrim over the screen, not a surface; ' +
      'the sheet in front of it is opaque.',
  },
  {
    token: 'hairline',
    lineOnly: 2,
    reason:
      'A one-dp divider is a line: translucent by design, explicit in the contrast themes.',
  },
  {
    token: 'grab',
    lineOnly: 6,
    reason: 'The sheet handle is a graphic of a few dp, not a surface.',
  },
];

export interface LiteralException {
  /** The ids of the nodes it covers (host type and testID, `View#status-pill-active`); all when absent. */
  node?: RegExp;
  /** The colours it allows when painting `theme`, compared on red, green and blue. */
  colours: (theme: PaletteName) => readonly string[];
  reason: string;
}

const schemeOf = (theme: PaletteName) => (theme.startsWith('dark') ? 'dark' : 'light');

export const LITERAL: readonly LiteralException[] = [
  {
    colours: (theme) => [
      ...Object.values(AppleButton[schemeOf(theme)]),
      ...Object.values(GoogleButton[schemeOf(theme)]),
      ...GoogleG.paths.map((path) => path.fill),
    ],
    reason:
      "The Sign in with Apple and Sign in with Google buttons: a provider's colours belong " +
      'to its brand and may not be retuned to a theme (Apple: black on white or white on ' +
      'black; Google: its light and dark button and the four-colour G). They are ' +
      'token-layer data (src/theme/brand-artwork.ts), so no screen writes them.',
  },
  {
    node: /^View#status-pill-active(-dot)?$/,
    colours: (theme) =>
      Object.values(Palettes[theme.endsWith('-contrast') ? 'light-contrast' : 'light']),
    reason:
      'The active status pill on a trip photograph (PhotoStatusPill, the hero card) is the LIGHT palette in every ' +
      'theme, on purpose: a white pill with navy words reads on any photograph, as pictured ' +
      '(contrast variant under increased contrast). Its shadow and live dot are light tokens.',
  },
];
