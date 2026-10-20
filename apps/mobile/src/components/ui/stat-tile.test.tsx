/**
 * T521 - contract C5-18 (`StatTile`), FR-055, FR-074, Q-1. A big tabular numeral, a lighter
 * `of N` or unit sibling on its baseline, a label beneath with an optional trailing glyph.
 * One control when it has an `onPress`; announced as "14 of 195 countries".
 *
 * Jest renders the kit's text as a plain host node that forwards every prop, so what is
 * asserted is the accessibility contract on the host nodes, the semantic classes and the
 * text props the adapter asked for, never real styling.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { StyleSheet, Text as NativeText } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { anyGlyph, glyphNamesIn, glyphsIn } from '../../../test/helpers/icons';
import { StatTile } from './stat-tile';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ...overrides,
  } as AppearanceContext);
}

beforeEach(() => mockAppearance());
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const classesOf = (testID: string) => tokens(screen.getByTestId(testID).props.className);
const styleOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

const countries = (props: Record<string, unknown> = {}) => (
  <StatTile value={14} of={195} label="Countries" testID="stat" {...props} />
);

describe('<StatTile> figure - Q-1, FR-074', () => {
  test('the numeral is Bricolage 36 / 40 in the default ink, tabular and capped at 1.3', async () => {
    await render(countries({ valueTestID: 'stat-value' }));
    const value = screen.getByTestId('stat-value');
    expect(value).toHaveTextContent('14');
    expect(tokens(value.props.className)).toEqual(
      expect.arrayContaining(['text-[36px]', 'font-display-bold', 'text-foreground']),
    );
    expect(value.props.maxFontSizeMultiplier).toBe(1.3);
    expect(styleOf('stat-value').fontVariant).toEqual(['tabular-nums']);
  });

  test('a number and a string are both the plain figure', async () => {
    await render(
      <>
        <StatTile value={61480} label="Kilometres" valueTestID="n" />
        <StatTile value="61,480" label="Kilometres" valueTestID="s" />
      </>,
    );
    expect(screen.getByTestId('n')).toHaveTextContent('61480');
    expect(screen.getByTestId('s')).toHaveTextContent('61,480');
  });

  test('the denominator is a lighter sibling on the same baseline', async () => {
    await render(countries({ valueTestID: 'stat-value' }));
    const of = screen.getByText('/195');
    expect(tokens(of.props.className)).toEqual(
      expect.arrayContaining(['text-[14px]', 'font-body-semibold', 'text-subtle']),
    );
    expect(classesOf('stat-figure')).toEqual(
      expect.arrayContaining(['flex-row', 'items-baseline']),
    );
  });

  test('a unit sits beside the figure the same way', async () => {
    await render(<StatTile value="61,480" unit="km" label="Distance" testID="stat" />);
    expect(tokens(screen.getByText('km').props.className)).toEqual(
      expect.arrayContaining(['text-[14px]', 'text-subtle']),
    );
  });

  test('there is no denominator or unit unless one is given', async () => {
    await render(<StatTile value={22} label="Trips" />);
    expect(screen.getAllByText(/./)).toHaveLength(2);
  });

  test('the label is a muted, capped caption', async () => {
    await render(countries());
    const label = screen.getByText('Countries');
    expect(tokens(label.props.className)).toEqual(
      expect.arrayContaining(['text-[13px]', 'font-body-semibold', 'text-muted']),
    );
    expect(label.props.maxFontSizeMultiplier).toBe(1.3);
  });

  test('an element can stand in for the numeral, such as a counting number', async () => {
    await render(
      <StatTile
        value={<NativeText testID="counting">14</NativeText>}
        of={195}
        label="Countries"
        accessibilityLabel="14 of 195 countries"
        testID="stat"
      />,
    );
    expect(screen.getByTestId('counting')).toBeTruthy();
    expect(screen.getByText('/195')).toBeTruthy();
  });
});

describe('<StatTile> read-only - the figure is announced once, in words', () => {
  test('is one element named "14 of 195 countries", and not a control', async () => {
    await render(countries());
    const tile = screen.getByTestId('stat');
    expect(tile.props.accessible).toBe(true);
    expect(tile.props.accessibilityLabel).toBe('14 of 195 countries');
    expect(tile.props.accessibilityRole).toBeUndefined();
    expect(tile.props.onPress).toBeUndefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('the name takes the unit, and nothing is said for what is missing', async () => {
    await render(
      <>
        <StatTile value="61,480" unit="km" label="Distance" testID="d" />
        <StatTile value={22} label="Trips" testID="t" />
      </>,
    );
    expect(screen.getByTestId('d').props.accessibilityLabel).toBe('61,480 km distance');
    expect(screen.getByTestId('t').props.accessibilityLabel).toBe('22 trips');
  });

  test('a caller name replaces the composed one', async () => {
    await render(countries({ accessibilityLabel: 'You have visited 14 countries' }));
    expect(screen.getByTestId('stat').props.accessibilityLabel).toBe(
      'You have visited 14 countries',
    );
  });

  test('draws no glyph unless asked, because nothing here opens', async () => {
    await render(countries());
    expect(glyphsIn()).toEqual([]);
  });

  test('a glyph the caller names is 16 dp, duotone, subtle and decorative', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string) => `colour:${token}`) as never);
    await render(countries({ icon: 'globe' }));
    expect(glyphsIn()).toEqual([
      expect.objectContaining({
        name: 'globe',
        size: 16,
        weight: 'duotone',
        color: 'colour:subtle',
      }),
    ]);
    expect(screen.queryByTestId(anyGlyph)).toBeNull();
  });

  test('the label is the caption role in the muted ink (the prototype’s .stat .l)', async () => {
    await render(countries());
    expect(tokens(screen.getByText('Countries').props.className)).toEqual(
      expect.arrayContaining(['text-muted']),
    );
  });

  test('the of-sibling is the semibold label role in the subtle ink', async () => {
    await render(countries());
    expect(tokens(screen.getByText('/195').props.className)).toEqual(
      expect.arrayContaining(['text-subtle']),
    );
  });

  test('an element value needs a name of its own', async () => {
    await expect(
      render(
        <StatTile value={<NativeText>14</NativeText>} label="Countries" testID="stat" />,
      ),
    ).rejects.toThrow(/accessibilityLabel/);
  });
});

describe('<StatTile onPress> is one control with a cue', () => {
  test('is a button named in words, and presses once', async () => {
    const onPress = jest.fn();
    await render(countries({ onPress }));
    const tile = screen.getByTestId('stat');
    expect(tile.props.accessibilityRole).toBe('button');
    expect(tile.props.accessibilityLabel).toBe('14 of 195 countries');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await fireEvent.press(tile);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('says what pressing does, after the name, when the caller gives a hint', async () => {
    await render(
      countries({ onPress: jest.fn(), accessibilityHint: 'Not available yet' }),
    );
    expect(screen.getByTestId('stat').props.accessibilityHint).toBe('Not available yet');
  });

  test('names its cue: a 16 dp chevron after the label, decorative', async () => {
    await render(countries({ onPress: jest.fn() }));
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: 'chevron-right', size: 16, weight: 'duotone' }),
    ]);
    expect(screen.queryByTestId(anyGlyph)).toBeNull();
    expect(screen.getByTestId('stat-cue', hidden).props.accessible).toBe(false);
  });

  test('a glyph of its own replaces the chevron', async () => {
    await render(countries({ onPress: jest.fn(), icon: 'arrow-right' }));
    expect(glyphNamesIn()).toEqual(['arrow-right']);
  });

  test('refuses a blank name from the caller', async () => {
    await expect(
      render(countries({ onPress: jest.fn(), accessibilityLabel: '  ' })),
    ).rejects.toThrow(/accessibilityLabel/);
  });

  test('busy and disabled are announced and ignore presses', async () => {
    const onPress = jest.fn();
    await render(countries({ onPress, disabled: true }));
    const tile = screen.getByTestId('stat');
    await fireEvent.press(tile);
    expect(onPress).not.toHaveBeenCalled();
    expect(tile.props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('<StatTile> at large text - the prototype\u2019s data-bigtext', () => {
  test('is a column at the default size: the figure over the label', async () => {
    await render(countries());
    expect(classesOf('stat-layout')).toEqual(expect.arrayContaining(['items-start']));
    expect(classesOf('stat-layout')).not.toContain('flex-row');
  });

  test('becomes a row from 1.15: the label on the left, the figure on the right', async () => {
    mockAppearance({ fontScale: 1.15 });
    await render(countries());
    expect(classesOf('stat-layout')).toEqual(
      expect.arrayContaining(['flex-row', 'items-center', 'justify-between']),
    );
  });

  test('in the row the label comes first in the tree, as it is on the left', async () => {
    mockAppearance({ fontScale: 2 });
    await render(countries({ valueTestID: 'stat-value' }));
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Countries')).toBeLessThan(tree.indexOf('"14"'));
  });
});
