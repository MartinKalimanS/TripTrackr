/**
 * T519 - the look of a `Button` as data (feature 005; contract C5-15; FR-006, FR-063,
 * FR-069; design-tokens C5-4 P5, P6, P15).
 *
 * `buttonLook` answers, for a variant and a state, WHICH PALETTE KEYS the fill, the label
 * and the edge are. Keys, not colours, so the rule "only ink text ever sits on a pressed
 * fill" is asserted as a rule here; `test/theme/adapter-pressed-fills.test.ts` then measures
 * every look in all four themes over the palette.
 */
import { PrimaryEdgeRing } from '@/theme';
import {
  BUTTON_VARIANTS,
  buttonEdgeWidth,
  buttonLook,
  type ButtonState,
} from './button-look';

const REST: ButtonState = { pressed: false, busy: false, disabled: false };
const PRESSED: ButtonState = { ...REST, pressed: true };
const BUSY: ButtonState = { ...REST, busy: true };
const DISABLED: ButtonState = { ...REST, disabled: true };

describe('the five variants - C5-15', () => {
  test('are primary, secondary, tonal, text and destructive', () => {
    expect([...BUTTON_VARIANTS]).toEqual([
      'primary',
      'secondary',
      'tonal',
      'text',
      'destructive',
    ]);
  });

  test.each([
    ['primary', { fill: 'accent', label: 'accentInk', edge: 'accentLine' }],
    ['secondary', { fill: null, label: 'ink', edge: 'ink' }],
    ['tonal', { fill: 'surfaceSecondary', label: 'ink', edge: 'hairline' }],
    ['text', { fill: null, label: 'ink', edge: null }],
    ['destructive', { fill: 'dangerTint', label: 'danger', edge: null }],
  ] as const)('%s at rest: %j', (variant, expected) => {
    expect(buttonLook(variant, REST)).toEqual(expected);
  });
});

describe('pressed - C5-15', () => {
  test.each([
    ['primary', { fill: 'accentPress', label: 'accentInk', edge: 'accentLine' }],
    ['secondary', { fill: 'surfaceSecondary', label: 'ink', edge: 'ink' }],
    ['tonal', { fill: 'pressed', label: 'ink', edge: 'hairline' }],
    ['text', { fill: 'pressed', label: 'ink', edge: null }],
    ['destructive', { fill: 'pressed', label: 'ink', edge: null }],
  ] as const)('%s: %j', (variant, expected) => {
    expect(buttonLook(variant, PRESSED)).toEqual(expected);
  });

  test.each(BUTTON_VARIANTS)(
    '%s: the label on a pressed fill is ink, or navy on the coral press, never muted',
    (variant) => {
      const { fill, label } = buttonLook(variant, PRESSED);
      // P5 (accentInk on accentPress) and P6 (ink on pressed) are the only pairs the gate
      // measures on a pressed fill; surfaceSecondary is a ground ink is gated on (P1).
      const allowed = {
        accentPress: 'accentInk',
        pressed: 'ink',
        surfaceSecondary: 'ink',
      };
      expect(allowed[fill as keyof typeof allowed]).toBe(label);
    },
  );
});

describe('busy and disabled - C5-15', () => {
  test('a busy primary is the pressed coral with its label kept', () => {
    expect(buttonLook('primary', BUSY)).toEqual({
      fill: 'accentPress',
      label: 'accentInk',
      edge: 'accentLine',
    });
  });

  test.each(['secondary', 'tonal', 'text', 'destructive'] as const)(
    'a busy %s looks as it does at rest: the spinner is the sign',
    (variant) => {
      expect(buttonLook(variant, BUSY)).toEqual(buttonLook(variant, REST));
    },
  );

  test('a disabled primary is flat sand with a subtle label and no ring', () => {
    expect(buttonLook('primary', DISABLED)).toEqual({
      fill: 'sand',
      label: 'subtle',
      edge: null,
    });
  });

  test.each(['secondary', 'tonal'] as const)(
    'a disabled %s is an outline in the border colour with a subtle label',
    (variant) => {
      expect(buttonLook(variant, DISABLED)).toEqual({
        fill: null,
        label: 'subtle',
        edge: 'border',
      });
    },
  );

  test.each(['text', 'destructive'] as const)(
    'a disabled %s is a subtle label',
    (variant) => {
      expect(buttonLook(variant, DISABLED)).toEqual({
        fill: null,
        label: 'subtle',
        edge: null,
      });
    },
  );

  test.each(BUTTON_VARIANTS)('%s: disabled wins over pressed', (variant) => {
    expect(buttonLook(variant, { ...DISABLED, pressed: true })).toEqual(
      buttonLook(variant, DISABLED),
    );
  });
});

describe('the edge - P15, FR-069', () => {
  test('the primary ring is 1.5 dp, 2 dp in the contrast themes, in accentLine', () => {
    expect(PrimaryEdgeRing.colourKey).toBe('accentLine');
    expect(buttonEdgeWidth('primary', false)).toBe(PrimaryEdgeRing.width);
    expect(buttonEdgeWidth('primary', true)).toBe(PrimaryEdgeRing.contrastWidth);
    expect(buttonEdgeWidth('primary', false)).toBe(1.5);
    expect(buttonEdgeWidth('primary', true)).toBe(2);
  });

  test('the secondary outline is 1.5 dp, the tonal hairline 1 dp, the others none', () => {
    expect(buttonEdgeWidth('secondary', false)).toBe(1.5);
    expect(buttonEdgeWidth('tonal', false)).toBe(1);
    expect(buttonEdgeWidth('text', false)).toBe(0);
    expect(buttonEdgeWidth('destructive', false)).toBe(0);
  });
});
