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

import { TextRoleNames, TextRoles, type TextRole } from '@/theme';

import { Text, type TextTone } from './text';

const classesOf = (testID = 'text') =>
  String(screen.getByTestId(testID).props.className ?? '').split(/\s+/);

const FONT_WEIGHT_CLASS: Record<number, string> = {
  400: 'font-normal',
  500: 'font-medium',
  600: 'font-semibold',
  700: 'font-bold',
};

describe('<Text> roles - FR-004, D4-07', () => {
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

  test.each(TextRoleNames.filter((role) => role !== 'numeric'))(
    'the %s role asks for exactly the token size and line height',
    async (role: TextRole) => {
      await render(
        <Text testID="text" type={role}>
          Lisbon
        </Text>,
      );
      const token = TextRoles[role];
      expect(classesOf()).toEqual(
        expect.arrayContaining([
          `text-[${token.size}px]`,
          `leading-[${token.lineHeight}px]`,
        ]),
      );
    },
  );

  test('the system roles ask for the token weight', async () => {
    for (const role of ['headline', 'body', 'callout', 'caption', 'numeric'] as const) {
      await render(
        <Text testID={role} type={role}>
          x
        </Text>,
      );
      expect(classesOf(role)).toContain(FONT_WEIGHT_CLASS[TextRoles[role].weight]);
    }
  });

  test('the display roles use the display face, not a system weight', async () => {
    await render(
      <>
        <Text testID="large" type="largeTitle">
          Trip
        </Text>
        <Text testID="title" type="title">
          Trip
        </Text>
      </>,
    );
    expect(classesOf('large')).toContain('font-display-bold');
    expect(classesOf('title')).toContain('font-display');
    expect(TextRoles.largeTitle.family).toBe('displayBold');
    expect(TextRoles.title.family).toBe('display');
    for (const id of ['large', 'title']) {
      expect(
        classesOf(id).some((c) => /^font-(normal|medium|semibold|bold)$/.test(c)),
      ).toBe(false);
    }
  });

  test('asks the platform for the matching Dynamic Type ramp (iOS)', async () => {
    await render(
      <>
        <Text testID="large" type="largeTitle">
          x
        </Text>
        <Text testID="body">x</Text>
        <Text testID="caption" type="caption">
          x
        </Text>
      </>,
    );
    expect(screen.getByTestId('large').props.dynamicTypeRamp).toBe('largeTitle');
    expect(screen.getByTestId('body').props.dynamicTypeRamp).toBe('body');
    expect(screen.getByTestId('caption').props.dynamicTypeRamp).toBe('caption1');
  });

  test('a caller may override the Dynamic Type ramp', async () => {
    await render(
      <Text testID="text" dynamicTypeRamp="footnote">
        x
      </Text>,
    );
    expect(screen.getByTestId('text').props.dynamicTypeRamp).toBe('footnote');
  });
});

describe('<Text> tone - FR-003, FR-023', () => {
  const EXPECTED: Record<TextTone, string> = {
    default: 'text-foreground',
    muted: 'text-muted',
    accent: 'text-accent',
    danger: 'text-danger',
    success: 'text-success',
    onAccent: 'text-accent-foreground',
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
      for (const role of TextRoleNames) {
        await render(
          <Text testID={`${tone}-${role}`} tone={tone} type={role}>
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

describe('<Text> accessibility - FR-029, FR-030', () => {
  test('large title and title are announced as headers', async () => {
    await render(
      <>
        <Text testID="large" type="largeTitle">
          x
        </Text>
        <Text testID="title" type="title">
          x
        </Text>
      </>,
    );
    expect(screen.getByTestId('large').props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('title').props.accessibilityRole).toBe('header');
  });

  test('the other roles are plain text', async () => {
    for (const role of ['headline', 'body', 'callout', 'caption', 'numeric'] as const) {
      await render(
        <Text testID={role} type={role}>
          x
        </Text>,
      );
      expect(screen.getByTestId(role).props.accessibilityRole).toBeUndefined();
    }
  });

  test('a caller role replaces the header role', async () => {
    await render(
      <Text testID="text" type="title" accessibilityRole="text">
        x
      </Text>,
    );
    expect(screen.getByTestId('text').props.accessibilityRole).toBe('text');
  });

  test('passes label, hint, numberOfLines and selectable through', async () => {
    await render(
      <Text
        testID="text"
        accessibilityLabel="Trip to Lisbon"
        accessibilityHint="Opens the trip"
        numberOfLines={2}
        selectable>
        Lisbon
      </Text>,
    );
    const props = screen.getByTestId('text').props;
    expect(props.accessibilityLabel).toBe('Trip to Lisbon');
    expect(props.accessibilityHint).toBe('Opens the trip');
    expect(props.numberOfLines).toBe(2);
    expect(props.selectable).toBe(true);
  });

  test('never caps the font scale: the largest text size must work (FR-029)', async () => {
    await render(<Text testID="text">x</Text>);
    expect(screen.getByTestId('text').props.maxFontSizeMultiplier).toBeUndefined();
    expect(screen.getByTestId('text').props.allowFontScaling).toBeUndefined();
  });
});

describe('<Text type="numeric"> - FR-004', () => {
  const styleOf = () =>
    StyleSheet.flatten(screen.getByTestId('text').props.style) as Record<string, unknown>;

  test('uses tabular numerals', async () => {
    await render(
      <Text testID="text" type="numeric">
        1,234.50
      </Text>,
    );
    expect(styleOf().fontVariant).toEqual(['tabular-nums']);
  });

  test('the other roles do not', async () => {
    await render(<Text testID="text">Lisbon</Text>);
    expect(styleOf()?.fontVariant).toBeUndefined();
  });

  test('keeps the caller style and lets it win', async () => {
    await render(
      <Text testID="text" type="numeric" style={{ textAlign: 'right', fontVariant: [] }}>
        1
      </Text>,
    );
    expect(styleOf().textAlign).toBe('right');
    expect(styleOf().fontVariant).toEqual([]);
  });

  test('takes its size from the context it sits in', async () => {
    await render(
      <>
        <Text testID="total" type="numeric" context="largeTitle">
          12
        </Text>
        <Text testID="price" type="numeric" context="callout">
          12
        </Text>
        <Text testID="plain" type="numeric">
          12
        </Text>
      </>,
    );
    expect(classesOf('total')).toEqual(
      expect.arrayContaining(['text-[32px]', 'leading-[38px]', 'font-display-bold']),
    );
    expect(classesOf('price')).toEqual(
      expect.arrayContaining(['text-[14px]', 'leading-[20px]', 'font-semibold']),
    );
    expect(classesOf('plain')).toEqual(
      expect.arrayContaining(['text-[16px]', 'leading-[24px]', 'font-semibold']),
    );
  });

  test('a large numeral is still a plain figure, not a header', async () => {
    await render(
      <Text testID="text" type="numeric" context="largeTitle">
        12
      </Text>,
    );
    expect(screen.getByTestId('text').props.accessibilityRole).toBeUndefined();
  });
});

describe('<Text type="numeric"> Dynamic Type follows its context', () => {
  test.each([
    [undefined, 'body'],
    ['largeTitle', 'largeTitle'],
    ['title', 'title2'],
    ['headline', 'headline'],
    ['callout', 'callout'],
    ['caption', 'caption1'],
  ] as const)('context %s asks for the %s ramp', async (context, ramp) => {
    await render(
      <Text testID="text" type="numeric" context={context}>
        12
      </Text>,
    );
    expect(screen.getByTestId('text').props.dynamicTypeRamp).toBe(ramp);
  });

  test('a numeric total in a hero grows like a large title, not like body text', async () => {
    await render(
      <>
        <Text testID="total" type="numeric" context="largeTitle">
          12
        </Text>
        <Text testID="plain" type="numeric">
          12
        </Text>
      </>,
    );
    expect(screen.getByTestId('total').props.dynamicTypeRamp).not.toBe(
      screen.getByTestId('plain').props.dynamicTypeRamp,
    );
  });
});

describe('the display faces are declared by src/global.css (research D4-07)', () => {
  const stylesheet = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'global.css'),
    'utf8',
  );
  // Tailwind turns `--font-<name>` in an `@theme` block into the `font-<name>` utility. It
  // generates nothing for a variable no class uses unless the block is `static`.
  const themeBlock = /@theme\s+static\s*\{([^}]*)\}/.exec(stylesheet)?.[1] ?? '';
  const SYSTEM_WEIGHTS = new Set(['normal', 'medium', 'semibold', 'bold']);

  test('declares --font-display and --font-display-bold in an @theme static block', () => {
    expect(themeBlock).toMatch(/--font-display:\s*'[^']+'/);
    expect(themeBlock).toMatch(/--font-display-bold:\s*'[^']+'/);
  });

  test('does not redefine the kit weights: body text stays in the platform face', () => {
    expect(stylesheet).not.toMatch(/--font-(?:normal|medium|semibold|bold)\s*:/);
  });

  test('every font class Text asks for is a weight or a declared family', async () => {
    for (const [index, props] of [
      { type: 'largeTitle' },
      { type: 'title' },
      { type: 'numeric', context: 'largeTitle' },
      { type: 'numeric', context: 'title' },
      { type: 'numeric' },
      { type: 'headline' },
      { type: 'body' },
      { type: 'callout' },
      { type: 'caption' },
    ].entries()) {
      await render(
        <Text testID={`text-${index}`} {...(props as object)}>
          x
        </Text>,
      );
      const families = classesOf(`text-${index}`)
        .filter((cls) => cls.startsWith('font-'))
        .map((cls) => cls.slice('font-'.length))
        .filter((name) => !SYSTEM_WEIGHTS.has(name));
      for (const family of families) {
        expect(themeBlock).toContain(`--font-${family}:`);
      }
    }
  });

  test('the two display roles do ask for a declared family', async () => {
    await render(
      <>
        <Text testID="large" type="largeTitle">
          x
        </Text>
        <Text testID="title" type="title">
          x
        </Text>
      </>,
    );
    expect(classesOf('large')).toContain('font-display-bold');
    expect(classesOf('title')).toContain('font-display');
  });
});
