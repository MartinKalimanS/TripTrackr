/**
 * T416 - contract C4-8 (`Text`), FR-004, FR-023, FR-029, research D4-07.
 *
 * Jest renders the kit's text as a plain React Native `Text` (test/mocks/heroui-native.tsx)
 * that forwards every prop, so what is asserted is what the adapter ASKS of the kit: the
 * semantic Tailwind classes and the accessibility props on the host node. Real styling
 * (sizes, faces, colours) is never asserted here; the role table is checked against the
 * typography tokens so a class cannot drift from `src/theme/typography.ts`.
 */
import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { StyleSheet } from 'react-native';

import { TypeRoleNames, TypeRoles, type TypeRole } from '@/theme';

import { Text, type TextTone } from './text';

const classesOf = (testID = 'text') =>
  String(screen.getByTestId(testID).props.className ?? '').split(/\s+/);

describe('<Text> default role - FR-004', () => {
  test('renders its children and forwards testID', async () => {
    await render(<Text testID="text">Lisbon</Text>);
    expect(screen.getByTestId('text')).toBeTruthy();
    expect(screen.getByText('Lisbon')).toBeTruthy();
  });

  test('defaults to the body role in the default tone', async () => {
    await render(<Text testID="text">Lisbon</Text>);
    expect(classesOf()).toEqual(
      expect.arrayContaining(['text-[16px]', 'leading-[24px]', 'text-foreground']),
    );
  });
});

describe('<Text> tone - FR-003, FR-023', () => {
  // Sunrise (T515): coral as TEXT is `accentText` (the coral fill is 2.82:1 on white), so the
  // `accent` tone resolves to `text-accent-text`; `aqua` and `amber` are their text inks.
  const EXPECTED: Record<TextTone, string> = {
    default: 'text-foreground',
    muted: 'text-muted',
    subtle: 'text-subtle',
    accent: 'text-accent-text',
    aqua: 'text-aqua-ink',
    amber: 'text-amber-ink',
    danger: 'text-danger',
    success: 'text-success',
    onAccent: 'text-accent-foreground',
    onInk: 'text-on-ink',
    onPhoto: 'text-on-photo',
  };

  test.each(Object.entries(EXPECTED) as [TextTone, string][])(
    'tone %s asks for the semantic class %s',
    async (tone, expected) => {
      await render(
        <Text testID="text" tone={tone}>
          x
        </Text>,
      );
      expect(classesOf()).toContain(expected);
    },
  );

  test('writes no colour literal into its classes (C4-1)', async () => {
    for (const tone of Object.keys(EXPECTED) as TextTone[]) {
      for (const role of TypeRoleNames) {
        await render(
          <Text testID={`${tone}-${role}`} tone={tone} variant={role}>
            x
          </Text>,
        );
        expect(String(screen.getByTestId(`${tone}-${role}`).props.className)).not.toMatch(
          /#[0-9a-f]{3,8}|rgb|hsl|oklch|\[color/i,
        );
      }
    }
  });

  test('a caller class comes last, so it wins the cascade', async () => {
    await render(
      <Text testID="text" className="text-center">
        x
      </Text>,
    );
    const classes = classesOf();
    expect(classes[classes.length - 1]).toBe('text-center');
  });
});

describe('<Text> font scale - FR-029', () => {
  test('never caps the font scale: the largest text size must work (FR-029)', async () => {
    await render(<Text testID="text">x</Text>);
    expect(screen.getByTestId('text').props.maxFontSizeMultiplier).toBeUndefined();
    expect(screen.getByTestId('text').props.allowFontScaling).toBeUndefined();
  });
});

describe('the display faces are declared by src/global.css (research D4-07, D5-06)', () => {
  const stylesheet = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'global.css'),
    'utf8',
  );
  // Tailwind turns `--font-<name>` in an `@theme` block into the `font-<name>` utility. It
  // generates nothing for a variable no class uses unless the block is `static`.
  const themeBlock = /@theme\s+static\s*\{([^}]*)\}/.exec(stylesheet)?.[1] ?? '';

  test('declares --font-display and --font-display-bold in an @theme static block', () => {
    expect(themeBlock).toMatch(/--font-display:\s*'[^']+'/);
    expect(themeBlock).toMatch(/--font-display-bold:\s*'[^']+'/);
  });

  test('does not redefine the kit weights: body text stays in the platform face', () => {
    expect(stylesheet).not.toMatch(/--font-(?:normal|medium|semibold|bold)\s*:/);
  });
});

/**
 * T515 — feature 005, contract C5-7. The roles are selected with `variant` (T564 deleted the 004
 * `type`).
 */
describe('<Text variant> — the Sunrise roles (C5-7, D5-06)', () => {
  const SIZED = TypeRoleNames.filter((role) => role !== 'accent');

  const styleOf = (testID = 'text') =>
    (StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {}) as Record<
      string,
      unknown
    >;

  test.each(SIZED)(
    'the %s variant asks for exactly the token size and line height',
    async (role: TypeRole) => {
      await render(
        <Text testID="text" variant={role}>
          Lisbon
        </Text>,
      );
      const token = TypeRoles[role];
      expect(classesOf()).toEqual(
        expect.arrayContaining([
          `text-[${token.size}px]`,
          `leading-[${token.lineHeight}px]`,
        ]),
      );
    },
  );

  test.each([
    ['display', 'font-display-bold'],
    ['numeral', 'font-display-bold'],
    ['title', 'font-display-bold'],
    ['headline', 'font-display-bold'],
    ['callout', 'font-display'],
    ['body', 'font-body'],
    ['label', 'font-body'],
    ['caption', 'font-body-semibold'],
    ['eyebrow', 'font-body-bold'],
    ['accent', 'font-serif-italic'],
  ] as [TypeRole, string][])('the %s variant sets the %s face', async (role, face) => {
    await render(
      <Text testID="text" variant={role}>
        Lisbon
      </Text>,
    );
    expect(classesOf()).toContain(face);
    // A weight is part of the family name (one file per weight): no `font-*` weight class.
    expect(classesOf().some((c) => /^font-(normal|medium|semibold|bold)$/.test(c))).toBe(
      false,
    );
  });

  test('the accent asks for no size: it inherits from the text it sits in', async () => {
    await render(
      <Text testID="parent" variant="display">
        Hello,{' '}
        <Text testID="text" variant="accent">
          Marti
        </Text>
      </Text>,
    );
    const accent = classesOf();
    expect(accent.some((c) => /^(text-\[|leading-\[)/.test(c))).toBe(false);
    expect(accent).toContain('font-serif-italic');
    expect(accent).toContain('text-foreground');
    expect(styleOf().fontSize).toBeUndefined();
    expect(classesOf('parent')).toContain('text-[40px]');
  });

  test('display, title and headline are announced as headers; the rest are plain text', async () => {
    for (const role of TypeRoleNames) {
      await render(
        <Text testID={role} variant={role}>
          x
        </Text>,
      );
      const header = ['display', 'title', 'headline'].includes(role);
      expect(screen.getByTestId(role).props.accessibilityRole).toBe(
        header ? 'header' : undefined,
      );
    }
  });

  test('a caller role replaces the header role', async () => {
    await render(
      <Text testID="text" variant="display" accessibilityRole="text">
        x
      </Text>,
    );
    expect(screen.getByTestId('text').props.accessibilityRole).toBe('text');
  });

  test('tracking, upper case and tabular figures go through the style, in dp', async () => {
    await render(
      <>
        <Text testID="display" variant="display">
          x
        </Text>
        <Text testID="numeral" variant="numeral">
          1,204
        </Text>
        <Text testID="eyebrow" variant="eyebrow">
          Portugal
        </Text>
        <Text testID="body" variant="body">
          x
        </Text>
      </>,
    );
    expect(styleOf('display').letterSpacing).toBe(-1.4);
    expect(styleOf('numeral')).toMatchObject({
      letterSpacing: -1.44,
      fontVariant: ['tabular-nums'],
    });
    expect(styleOf('eyebrow')).toMatchObject({
      letterSpacing: 0.72,
      textTransform: 'uppercase',
    });
    expect(styleOf('body')).toEqual({});
  });

  test('keeps the caller style and lets it win', async () => {
    await render(
      <Text
        testID="text"
        variant="numeral"
        style={{ textAlign: 'right', fontVariant: [] }}>
        1
      </Text>,
    );
    expect(styleOf().textAlign).toBe('right');
    expect(styleOf().fontVariant).toEqual([]);
  });

  describe('the 1.3 cap (FR-074)', () => {
    test('the numeral and the eyebrow are capped, and no other role is by default', async () => {
      for (const role of TypeRoleNames) {
        await render(
          <Text testID={role} variant={role}>
            x
          </Text>,
        );
        const capped = role === 'numeral' || role === 'eyebrow';
        expect(screen.getByTestId(role).props.maxFontSizeMultiplier).toBe(
          capped ? 1.3 : undefined,
        );
      }
    });

    test.each(['callout', 'label', 'caption'] as const)(
      'the %s variant is capped when it says it is a chip, pill or label of the chrome',
      async (role) => {
        await render(
          <Text testID="text" variant={role} capped>
            x
          </Text>,
        );
        expect(screen.getByTestId('text').props.maxFontSizeMultiplier).toBe(1.3);
      },
    );

    test.each(['display', 'title', 'headline', 'body', 'accent'] as const)(
      'the %s variant is never capped, even when asked: the largest text size must work',
      async (role) => {
        await render(
          <Text testID="text" variant={role} capped>
            x
          </Text>,
        );
        expect(screen.getByTestId('text').props.maxFontSizeMultiplier).toBeUndefined();
      },
    );

    test('a caller may still lower or lift the cap with its own prop', async () => {
      await render(
        <Text testID="text" variant="numeral" maxFontSizeMultiplier={1}>
          1
        </Text>,
      );
      expect(screen.getByTestId('text').props.maxFontSizeMultiplier).toBe(1);
    });
  });

  test.each(['body', 'label'] as const)(
    'strong turns the %s variant to the semibold face',
    async (role) => {
      await render(
        <>
          <Text testID="plain" variant={role}>
            x
          </Text>
          <Text testID="strong" variant={role} strong>
            x
          </Text>
        </>,
      );
      expect(classesOf('plain')).toContain('font-body');
      expect(classesOf('strong')).toContain('font-body-semibold');
      expect(classesOf('strong')).not.toContain('font-body');
    },
  );

  test('strong changes nothing on a role that is not body text', async () => {
    await render(
      <Text testID="text" variant="display" strong>
        x
      </Text>,
    );
    expect(classesOf()).toContain('font-display-bold');
  });

  test.each([
    ['display', 'largeTitle'],
    ['numeral', 'title1'],
    ['title', 'title1'],
    ['headline', 'title2'],
    ['callout', 'headline'],
    ['body', 'body'],
    ['label', 'subheadline'],
    ['caption', 'footnote'],
    ['eyebrow', 'caption1'],
  ] as [TypeRole, string][])(
    'the %s variant asks for the %s Dynamic Type ramp (iOS)',
    async (role, ramp) => {
      await render(
        <Text testID="text" variant={role}>
          x
        </Text>,
      );
      expect(screen.getByTestId('text').props.dynamicTypeRamp).toBe(ramp);
    },
  );

  test('a caller may override the Dynamic Type ramp', async () => {
    await render(
      <Text testID="text" variant="title" dynamicTypeRamp="footnote">
        x
      </Text>,
    );
    expect(screen.getByTestId('text').props.dynamicTypeRamp).toBe('footnote');
  });

  test('a caller class comes last, so it wins the cascade', async () => {
    await render(
      <Text testID="text" variant="headline" className="text-center">
        x
      </Text>,
    );
    const classes = classesOf();
    expect(classes[classes.length - 1]).toBe('text-center');
  });

  test('passes label, hint, numberOfLines and testID through', async () => {
    await render(
      <Text
        testID="text"
        variant="callout"
        accessibilityLabel="Trip to Lisbon"
        accessibilityHint="Opens the trip"
        numberOfLines={2}>
        Lisbon
      </Text>,
    );
    const props = screen.getByTestId('text').props;
    expect(props.accessibilityLabel).toBe('Trip to Lisbon');
    expect(props.accessibilityHint).toBe('Opens the trip');
    expect(props.numberOfLines).toBe(2);
  });

  test('writes no colour literal into its classes (C4-1)', async () => {
    for (const role of TypeRoleNames) {
      await render(
        <Text testID={role} variant={role} tone="accent">
          x
        </Text>,
      );
      expect(String(screen.getByTestId(role).props.className)).not.toMatch(
        /#[0-9a-f]{3,8}|rgb|hsl|oklch|\[color/i,
      );
    }
  });
});

describe('the Sunrise faces are declared by src/global.css (research D5-06; T504)', () => {
  const stylesheet = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'global.css'),
    'utf8',
  );
  const declared = [...stylesheet.matchAll(/--font-([a-z-]+):/g)].map(
    (match) => match[1],
  );

  /**
   * The DM Sans and Instrument Serif families are wired in `global.css` by T504 (branch
   * `feat/005-fonts-mocks`), not by this task, so a checkout without that branch does not
   * declare them yet. They are listed so the check passes on both sides of the merge; once
   * T504 is in, every entry here is declared and the list can be deleted.
   */
  const AWAITING_T504 = ['body', 'body-semibold', 'body-bold', 'serif-italic'];

  test('every face a variant asks for is declared, or is awaiting T504', async () => {
    for (const role of TypeRoleNames) {
      await render(
        <Text testID={role} variant={role} strong>
          x
        </Text>,
      );
      const families = classesOf(role)
        .filter((cls) => cls.startsWith('font-'))
        .map((cls) => cls.slice('font-'.length));
      for (const family of families) {
        expect({
          family,
          ok: declared.includes(family) || AWAITING_T504.includes(family),
        }).toEqual({
          family,
          ok: true,
        });
      }
    }
  });

  test('the Bricolage faces the tabular and display roles use are declared today', () => {
    expect(declared).toEqual(expect.arrayContaining(['display', 'display-bold']));
  });
});
