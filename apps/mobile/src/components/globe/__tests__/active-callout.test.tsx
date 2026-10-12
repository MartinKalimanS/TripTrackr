/**
 * The callout of the live trip — feature 005, T533 (FR-011, FR-073; research D5-04,
 * contract C5-24).
 *
 * ONE `MarkerView` for the whole globe: a coral ring and a pulse round the live trip's pin,
 * and a white card, "Portugal Road Trip / Day 3 of 8 · Sintra", on the side of the pin that
 * has room. The pulse is a Reanimated CSS animation (`animationName`, declarative, on the UI
 * thread); under reduced motion the ring is still. Screen readers hear it once, because the
 * map is a single image to them and the callout cannot be focused.
 */
import { configure, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { Colors, GlobeColors, GlobeLayers, GlobeStyle } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { Motion } from '@/theme';

import { ActiveCallout, type ActiveCalloutProps } from '../active-callout';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  const theme = overrides.theme ?? 'light';
  useAppearance.mockReturnValue({
    theme,
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    tokens: Colors[theme],
    ...overrides,
  } as AppearanceContext);
}

const PROPS: ActiveCalloutProps = {
  coordinate: [-9.14, 38.72],
  title: 'Portugal Road Trip',
  detail: 'Day 3 of 8 · Sintra',
};

const flat = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

let announce: jest.SpyInstance;

// The callout is hidden from the screen reader on purpose (it is announced instead), and a
// query skips what is hidden from it; these tests read the card all the same.
beforeAll(() => configure({ defaultIncludeHiddenElements: true }));
afterAll(() => configure({ defaultIncludeHiddenElements: false }));

beforeEach(() => {
  mockAppearance();
  announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation();
});

afterEach(() => {
  announce.mockRestore();
});

describe('<ActiveCallout> — one MarkerView', () => {
  test('is ONE marker, at the live trip’s coordinate, centred on its pin and left to the map', async () => {
    await render(<ActiveCallout {...PROPS} />);
    const markers = screen.getAllByTestId('mapbox-MarkerView');
    expect(markers).toHaveLength(1);
    expect(markers[0]!.props).toMatchObject({
      coordinate: PROPS.coordinate,
      anchor: { x: 0.5, y: 0.5 },
      allowOverlap: true,
      pointerEvents: 'none',
    });
  });

  test('says what the trip is and where it is: title on one line, "Day 3 of 8 · Sintra" under it', async () => {
    await render(<ActiveCallout {...PROPS} />);
    const title = screen.getByTestId('globe-callout-title');
    const detail = screen.getByTestId('globe-callout-detail');
    expect(title.props.children).toBe('Portugal Road Trip');
    expect(title.props.numberOfLines).toBe(1);
    expect(detail.props.children).toBe('Day 3 of 8 · Sintra');
    expect(detail.props.numberOfLines).toBe(1);
  });

  test.each(['light', 'dark'] as const)(
    '%s: a white card with navy text, a coral live dot',
    async (theme) => {
      mockAppearance({ theme });
      await render(<ActiveCallout {...PROPS} />);
      const { surface, title, detail, liveDot } = GlobeStyle[theme].callout;
      expect(flat('globe-callout')).toMatchObject({ backgroundColor: surface });
      expect(flat('globe-callout-title')).toMatchObject({ color: title });
      expect(flat('globe-callout-detail')).toMatchObject({ color: detail });
      expect(flat('globe-callout-dot')).toMatchObject({ backgroundColor: liveDot });
    },
  );

  test('the card is at most 220 dp wide, its corners 16, lifted', async () => {
    await render(<ActiveCallout {...PROPS} />);
    expect(flat('globe-callout')).toMatchObject({
      maxWidth: GlobeLayers.callout.maxWidth,
      borderRadius: 16,
    });
    expect(flat('globe-callout')).toHaveProperty('boxShadow');
  });

  test('a narrower cap, from the placement, narrows the card', async () => {
    await render(<ActiveCallout {...PROPS} maxWidth={140} />);
    expect(flat('globe-callout').maxWidth).toBe(140);
  });

  test('reports the size of the card, so the placement knows what has to fit', async () => {
    const onCardLayout = jest.fn();
    await render(<ActiveCallout {...PROPS} onCardLayout={onCardLayout} />);
    screen.getByTestId('globe-callout').props.onLayout({
      nativeEvent: { layout: { width: 163, height: 54, x: 0, y: 0 } },
    });
    expect(onCardLayout).toHaveBeenCalledWith({ width: 163, height: 54 });
  });
});

describe('<ActiveCallout> — the side of the pin', () => {
  test.each([
    ['left', 'row'],
    ['right', 'row'],
    ['above', 'column'],
    ['below', 'column'],
  ] as const)(
    '%s: the card sits on that side of the ring, in a %s',
    async (side, direction) => {
      await render(<ActiveCallout {...PROPS} side={side} />);
      const layout = screen.getByTestId('globe-callout-layout');
      expect(layout.props.accessibilityState).toBeUndefined();
      expect(flat('globe-callout-layout').flexDirection).toBe(direction);
      const order = screen
        .getAllByTestId(/^globe-callout-(card-slot|ring|mirror)$/)
        .map((node) => node.props.testID);
      const cardFirst = side === 'left' || side === 'above';
      expect(order[cardFirst ? 0 : 2]).toBe('globe-callout-card-slot');
      expect(order[1]).toBe('globe-callout-ring');
      expect(order[cardFirst ? 2 : 0]).toBe('globe-callout-mirror');
    },
  );

  test('keeps the pin at the middle of the marker whatever the side: a hidden mirror of the card balances it', async () => {
    await render(<ActiveCallout {...PROPS} side="left" />);
    const mirror = screen.getByTestId('globe-callout-mirror', {
      includeHiddenElements: true,
    });
    expect(flat('globe-callout-mirror')).toMatchObject({ opacity: 0 });
    expect(mirror.props.pointerEvents).toBe('none');
    expect(mirror.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(mirror.props.accessibilityElementsHidden).toBe(true);
  });

  test('defaults to the left of the pin, the prototype’s first choice', async () => {
    await render(<ActiveCallout {...PROPS} />);
    expect(flat('globe-callout-layout').flexDirection).toBe('row');
    const order = screen
      .getAllByTestId(/^globe-callout-(card-slot|ring|mirror)$/)
      .map((node) => node.props.testID);
    expect(order[0]).toBe('globe-callout-card-slot');
  });
});

describe('<ActiveCallout> — the ring and the pulse', () => {
  test('a coral ring in the live token, round the pin', async () => {
    await render(<ActiveCallout {...PROPS} />);
    expect(flat('globe-callout-ring')).toMatchObject({
      borderColor: GlobeColors.light.active,
      borderWidth: 2.5,
    });
  });

  test('the pulse is a repeating CSS animation: scale to 1.7 while the opacity falls from .6 to 0', async () => {
    await render(<ActiveCallout {...PROPS} />);
    expect(flat('globe-callout-pulse')).toMatchObject({
      animationName: {
        from: { transform: [{ scale: 1 }], opacity: Motion.pulseOpacityFrom },
        to: { transform: [{ scale: Motion.pulseScaleTo }], opacity: 0 },
      },
      animationDuration: `${Motion.pulseMs}ms`,
      animationIterationCount: 'infinite',
      animationPlayState: 'running',
      borderColor: GlobeColors.light.active,
    });
    expect(Motion.pulseMs).toBe(2400);
    expect(Motion.pulseScaleTo).toBe(1.7);
    expect(Motion.pulseOpacityFrom).toBe(0.6);
  });

  test('pauses while the globe is not on screen or the app is away', async () => {
    await render(<ActiveCallout {...PROPS} running={false} />);
    expect(flat('globe-callout-pulse').animationPlayState).toBe('paused');
  });

  test('is STILL under reduced motion: no animation at all, a faint static ring (FR-019, FR-073)', async () => {
    mockAppearance({ prefersLessMotion: true });
    await render(<ActiveCallout {...PROPS} />);
    const pulse = flat('globe-callout-pulse');
    for (const key of [
      'animationName',
      'animationDuration',
      'animationIterationCount',
      'animationPlayState',
    ]) {
      expect(pulse).not.toHaveProperty(key);
    }
    expect(pulse).toMatchObject({ opacity: 0.28, transform: [{ scale: 1.25 }] });
  });

  test('the pulse is drawn at the size of the ring', async () => {
    await render(<ActiveCallout {...PROPS} ringSize={72} />);
    expect(flat('globe-callout-ring')).toMatchObject({ width: 72, height: 72 });
    expect(flat('globe-callout-pulse')).toMatchObject({ width: 72, height: 72 });
  });
});

describe('<ActiveCallout> — screen readers', () => {
  test('is announced ONCE: the trip, the day and the place, said as a sentence', async () => {
    await render(<ActiveCallout {...PROPS} />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Portugal Road Trip, Day 3 of 8, Sintra');
  });

  test('does not repeat itself when the globe re-renders or the card moves to another side', async () => {
    const view = await render(<ActiveCallout {...PROPS} />);
    await view.rerender(<ActiveCallout {...PROPS} side="right" running={false} />);
    await view.rerender(<ActiveCallout {...PROPS} side="above" maxWidth={150} />);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  test('says it again only when it has something new to say: the next day', async () => {
    const view = await render(<ActiveCallout {...PROPS} />);
    await view.rerender(<ActiveCallout {...PROPS} detail="Day 4 of 8 · Porto" />);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith('Portugal Road Trip, Day 4 of 8, Porto');
  });

  test('is not an element of its own: the map is the one image, the card is hidden from the reader', async () => {
    await render(<ActiveCallout {...PROPS} />);
    const layout = screen.getByTestId('globe-callout-layout', {
      includeHiddenElements: true,
    });
    expect(layout.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(layout.props.accessibilityElementsHidden).toBe(true);
  });
});
