/**
 * The two sign-in brands' own artwork (feature 005, F12; owner decision Q-11; Apple's
 * "Sign in with Apple" button rules, Google's "Sign in with Google" branding guidelines,
 * `docs/release/store-readiness.md` "Branded sign-in buttons").
 *
 * A provider's colours are NOT the app's palette: they belong to the brand and may not be
 * retuned to match a theme. They live here, in the token layer, so no screen or component
 * writes a colour literal; the contrast of a brand's own button is the brand's rule (Apple
 * asks for black on white or white on black, Google for its four-colour "G").
 *
 * - `GoogleG`: the four-colour "G" in Google's 48 by 48 box, one path per colour.
 * - `GoogleButton`: the fill, ink and boundary of the Google button in each scheme (Google's
 *   light and dark button: a white button with a grey line, a near-black one with a light line);
 * - `AppleButton`: the fill and ink of the Sign in with Apple button in each scheme (black with a
 *   white logo on light grounds; white with a black logo on dark ones).
 *
 * Pure data.
 */
import { deepFreeze } from './freeze';

export const GoogleG = deepFreeze({
  box: 48,
  paths: [
    {
      fill: '#EA4335',
      d: 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z',
    },
    {
      fill: '#4285F4',
      d: 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z',
    },
    {
      fill: '#FBBC05',
      d: 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z',
    },
    {
      fill: '#34A853',
      d: 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z',
    },
  ],
} as const);

export const GoogleButton = deepFreeze({
  light: { fill: '#FFFFFF', ink: '#1F1F1F', border: '#747775' },
  dark: { fill: '#131314', ink: '#E3E3E3', border: '#8E918F' },
} as const);

export const AppleButton = deepFreeze({
  light: { fill: '#000000', ink: '#FFFFFF' },
  dark: { fill: '#FFFFFF', ink: '#000000' },
} as const);
