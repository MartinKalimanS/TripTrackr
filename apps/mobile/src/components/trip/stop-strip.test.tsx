/**
 * T540 - `StopStrip` (contract C5-19; FR-031): one dot per stop over a hero, joined by a 2 dp
 * line that is solid up to the stop the traveller has reached and dashed beyond it. A done
 * stop is filled, the one here a thick ring with a halo, the next a ring, the rest a thinner
 * ring; the abbreviation of each city sits under its dot in the caption role at 12 / 14. Decorative:
 * hidden from assistive technology (the card's name carries the stops), and all of it in the
 * opaque on-photo ink (text and marks over a picture are never an alpha white).
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { StopDot } from '@/features/trips/trip-card-model';
import { Palettes } from '@/theme';

import { classesOf } from '../../../test/helpers/host-nodes';
import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { StopStrip } from './stop-strip';

afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;
const dot = (index: number) => screen.getByTestId(`stop-strip-dot-${index}`, hidden);
const link = (index: number) => screen.getByTestId(`stop-strip-link-${index}`, hidden);

async function renderStrip(dots: StopDot[], labels?: string[]) {
  mockThemeColors('light');
  await render(<StopStrip dots={dots} labels={labels} />);
}

describe('<StopStrip> dots', () => {
  test('draws one dot per stop, in order', async () => {
    await renderStrip(['done', 'now', 'next', 'later']);
    expect([0, 1, 2, 3].map((i) => dot(i).props.testID)).toEqual([
      'stop-strip-dot-0',
      'stop-strip-dot-1',
      'stop-strip-dot-2',
      'stop-strip-dot-3',
    ]);
    expect(screen.queryByTestId('stop-strip-dot-4', hidden)).toBeNull();
  });

  test('a done stop is a filled dot of 12 dp in the on-photo ink', async () => {
    await renderStrip(['done']);
    expect(flat(dot(0))).toMatchObject({
      width: 12,
      height: 12,
      backgroundColor: asCss(Palettes.light.onPhoto),
    });
  });

  test('the stop here is a thick ring, hollow, with a halo around it', async () => {
    await renderStrip(['now']);
    const style = flat(dot(0));
    expect(style.backgroundColor).toBe('transparent');
    expect(style).toMatchObject({
      borderWidth: 3,
      borderColor: asCss(Palettes.light.onPhoto),
    });
    expect(flat(screen.getByTestId('stop-strip-halo-0', hidden))).toMatchObject({
      borderWidth: 4,
    });
  });

  test('the next stop is a thinner ring and a later one thinner still: shape, never colour', async () => {
    await renderStrip(['next', 'later']);
    expect(flat(dot(0))).toMatchObject({
      backgroundColor: 'transparent',
      borderWidth: 2,
    });
    expect(flat(dot(1))).toMatchObject({
      backgroundColor: 'transparent',
      borderWidth: 1.5,
    });
    expect(flat(dot(0)).borderColor).toBe(asCss(Palettes.light.onPhoto));
    expect(flat(dot(1)).borderColor).toBe(asCss(Palettes.light.onPhoto));
  });
});

describe('<StopStrip> links', () => {
  test('has no line before the first dot', async () => {
    await renderStrip(['done', 'now']);
    expect(screen.queryByTestId('stop-strip-link-0', hidden)).toBeNull();
  });

  test('a line is solid up to a stop that is done or here, dashed beyond', async () => {
    await renderStrip(['done', 'done', 'now', 'next', 'later']);
    expect([1, 2, 3, 4].map((i) => flat(link(i)).borderStyle)).toEqual([
      'solid',
      'solid',
      'dashed',
      'dashed',
    ]);
  });

  test('a line is 2 dp, in the on-photo ink', async () => {
    await renderStrip(['done', 'now']);
    expect(flat(link(1))).toMatchObject({
      borderTopWidth: 2,
      borderColor: asCss(Palettes.light.onPhoto),
    });
  });
});

describe('<StopStrip> labels', () => {
  test('puts the abbreviation of each city under its dot', async () => {
    await renderStrip(['done', 'now', 'next'], ['LIS', 'SIN', 'POR']);
    expect(screen.getByText('LIS', hidden)).toBeTruthy();
    expect(screen.getByText('SIN', hidden)).toBeTruthy();
    expect(screen.getByText('POR', hidden)).toBeTruthy();
  });

  // Prototype `.strip .st`: 600, 12 / 14, tracking .06em; 2 dp under the dot (the halo box is 16).
  test('sets each label in 12 / 14 semibold with .06em tracking, capped, 2 dp under the dot', async () => {
    await renderStrip(['done', 'now', 'next'], ['LIS', 'SIN', 'POR']);
    const label = screen.getByTestId('stop-strip-label-0', hidden);
    expect(flat(label)).toMatchObject({
      fontSize: 12,
      lineHeight: 14,
      letterSpacing: 0.72,
      marginTop: -2,
    });
    expect(classesOf(label)).toContain('font-body-semibold');
    expect(classesOf(label)).toContain('text-on-photo');
    expect(label.props.maxFontSizeMultiplier).toBe(1.3);
  });

  test('takes the box the card gives it', async () => {
    await render(<StopStrip dots={['done']} style={{ marginTop: 6 }} />);
    expect(flat(screen.getByTestId('stop-strip', hidden)).marginTop).toBe(6);
  });

  test('draws nothing for a city this device has not cached', async () => {
    await renderStrip(['done', 'next'], ['LIS', '']);
    expect(screen.getByText('LIS', hidden)).toBeTruthy();
    expect(screen.queryByTestId('stop-strip-label-1', hidden)).toBeNull();
  });

  test('has no labels beyond five stops: they would collide', async () => {
    await renderStrip(
      ['done', 'done', 'now', 'next', 'later', 'later'],
      ['A', 'B', 'C', 'D', 'E', 'F'],
    );
    expect(screen.queryByText('A', hidden)).toBeNull();
    expect(screen.getByTestId('stop-strip-dot-5', hidden)).toBeTruthy();
  });

  test('draws no labels when it is given none', async () => {
    await renderStrip(['done', 'now']);
    expect(screen.queryByTestId('stop-strip-label-0', hidden)).toBeNull();
  });
});

describe('<StopStrip> as decoration', () => {
  test('is hidden from assistive technology, with everything in it', async () => {
    await renderStrip(['done', 'now'], ['LIS', 'SIN']);
    const root = screen.getByTestId('stop-strip', hidden);
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByTestId('stop-strip')).toBeNull();
  });

  test('draws nothing for a trip with no stops', async () => {
    await renderStrip([]);
    expect(screen.queryByTestId('stop-strip', hidden)).toBeNull();
  });
});
