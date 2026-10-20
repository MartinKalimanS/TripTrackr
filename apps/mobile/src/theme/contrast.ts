/**
 * WCAG contrast measurement — contract C2.
 *
 * This lives in shipped source rather than in a test helper on purpose. It is
 * what makes SC-002 a standing build gate instead of a release-time audit, and
 * it is how Constitution Principle IV ("verify before you render") applies to
 * the palette itself: the ramp is measured, never asserted.
 *
 * Pure. No platform, no device, no I/O.
 */

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** sRGB companding threshold from the WCAG definition. */
const LINEAR_THRESHOLD = 0.04045;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_DIVISOR = 1.055;
const GAMMA_EXPONENT = 2.4;

/** WCAG channel coefficients. */
const RED_COEFFICIENT = 0.2126;
const GREEN_COEFFICIENT = 0.7152;
const BLUE_COEFFICIENT = 0.0722;

/** Added to both luminances so the ratio stays finite for pure black. */
const RATIO_OFFSET = 0.05;

function expandShorthand(hex: string): string {
  if (hex.length !== 4) return hex;
  const [, r, g, b] = hex;
  return `#${r}${r}${g}${g}${b}${b}`;
}

function toChannels(hex: string): [number, number, number] {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(
      `Expected a hex colour such as #E3E8EF or #FFF, received "${hex}". ` +
        'Named colours and rgb() strings cannot be measured, so they cannot be tokens.',
    );
  }
  const value = parseInt(expandShorthand(hex).slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function linearise(channel: number): number {
  const normalised = channel / 255;
  return normalised <= LINEAR_THRESHOLD
    ? normalised / LINEAR_DIVISOR
    : Math.pow((normalised + GAMMA_OFFSET) / GAMMA_DIVISOR, GAMMA_EXPONENT);
}

/**
 * Relative luminance of a hex colour, in [0, 1].
 *
 * @throws if the value is not a 3- or 6-digit hex colour.
 */
export function relativeLuminance(hex: string): number {
  const [red, green, blue] = toChannels(hex);
  return (
    RED_COEFFICIENT * linearise(red) +
    GREEN_COEFFICIENT * linearise(green) +
    BLUE_COEFFICIENT * linearise(blue)
  );
}

/**
 * WCAG contrast ratio between two hex colours, in [1, 21]. Symmetric.
 */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + RATIO_OFFSET) / (darker + RATIO_OFFSET);
}

function toHex([red, green, blue]: [number, number, number]): string {
  const part = (channel: number) => channel.toString(16).padStart(2, '0');
  return `#${part(red)}${part(green)}${part(blue)}`.toUpperCase();
}

/**
 * Composite `foreground` at `alpha` (0 to 1) over an OPAQUE `background`, in sRGB, and
 * return an uppercase `#RRGGBB` — contract 004 C4-2.
 *
 * This is what lets the gate measure the tinted chips and the hover and pressed fills
 * the UI kit derives with `color-mix(in oklab, ...)`. The kit mixes in OKLAB; this
 * mixes the encoded sRGB channels, and the gate carries a stated 0.1 tolerance for the
 * difference. Each channel is rounded to the nearest integer.
 *
 * @throws RangeError if `alpha` is not a number in [0, 1].
 * @throws if either colour is not a 3- or 6-digit hex colour.
 */
export function blend(foreground: string, background: string, alpha: number): string {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RangeError(`Expected an alpha between 0 and 1, received ${alpha}.`);
  }
  const [fr, fg, fb] = toChannels(foreground);
  const [br, bg, bb] = toChannels(background);
  const mix = (top: number, bottom: number) =>
    Math.round(top * alpha + bottom * (1 - alpha));
  return toHex([mix(fr, br), mix(fg, bg), mix(fb, bb)]);
}

/** The floors this product holds itself to. See contract C3. */
export const ContrastFloor = {
  /** FR-008 — body text against its surface. */
  normalText: 4.5,
  /** FR-008 — large text against its surface. */
  largeText: 3,
  /** FR-009 / FR-012 — controls, boundaries, focus indicators. */
  nonText: 3,
  /** FR-013 — every text pair when increased contrast is requested. */
  increasedContrast: 7,
} as const;

export type ContrastFloorName = keyof typeof ContrastFloor;

/** Whether a pair clears a named floor. */
export function meetsFloor(a: string, b: string, floor: ContrastFloorName): boolean {
  return contrastRatio(a, b) >= ContrastFloor[floor];
}
