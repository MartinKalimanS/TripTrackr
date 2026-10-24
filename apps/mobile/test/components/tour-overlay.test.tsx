/**
 * Feature 007 (T703) - the first-run tour's overlay (FR-003, FR-005, FR-008). Jest has no layout
 * engine, so each target is a fake node that answers `measureInWindow` with a rectangle; what is
 * asserted is what the overlay draws for it.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler, Dimensions, Platform, StyleSheet } from 'react-native';

import { SPOTLIGHT_PAD } from '@/components/tour/tour-geometry';
import { TourOverlay } from '@/components/tour/tour-overlay';
import { registerTourTarget, type TourTargetNode } from '@/components/tour/tour-targets';
import { TOUR_STEPS, type TourTarget } from '@/features/tour/tour-steps';
import { useTourStore } from '@/features/tour/tour-store';

import { appearanceOf } from '../helpers/appearance';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

const WINDOW = { width: 390, height: 844 };
type Box = [number, number, number, number];
const RECTS: Record<TourTarget, Box> = {
  totals: [20, 520, 350, 90],
  'plan-trip': [230, 650, 140, 52],
  'tab-trips': [140, 760, 110, 52],
  'tab-profile': [260, 760, 110, 52],
};

function fakeNode([x, y, width, height]: Box): TourTargetNode {
  return { measureInWindow: (done) => done(x, y, width, height) };
}

function registerAll() {
  for (const [id, box] of Object.entries(RECTS)) {
    registerTourTarget(id as TourTarget, fakeNode(box));
  }
}

// The dim, the ring and the blocker are hidden from assistive technology on purpose.
const HIDDEN = { includeHiddenElements: true } as const;
const dims = () => screen.queryAllByTestId(/^tour-dim-/, HIDDEN);
const part = (testID: string) => screen.getByTestId(testID, HIDDEN);
const styleOf = (testID: string) =>
  StyleSheet.flatten(part(testID).props.style) as Record<string, unknown>;

type Json = {
  type: string;
  props?: Record<string, unknown>;
  children?: unknown[] | null;
};
function findScroller(node: unknown): Json | undefined {
  if (Array.isArray(node)) return node.map(findScroller).find(Boolean);
  if (typeof node !== 'object' || node === null) return undefined;
  const json = node as Json;
  return json.type === 'RCTScrollView' ? json : findScroller(json.children ?? []);
}
function hasType(node: unknown, type: string): boolean {
  if (Array.isArray(node)) return node.some((child) => hasType(child, type));
  if (typeof node !== 'object' || node === null) return false;
  const json = node as Json;
  return json.type === type || hasType(json.children ?? [], type);
}

let onClosed: jest.Mock;

beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ ...WINDOW, scale: 3, fontScale: 1 });
  useAppearance.mockReturnValue(appearanceOf('light'));
  useTourStore.setState({ open: false, step: 0 });
  onClosed = jest.fn();
  registerAll();
});

afterEach(() => {
  for (const id of Object.keys(RECTS)) registerTourTarget(id as TourTarget, null);
  jest.restoreAllMocks();
});

async function openAt(step = 0) {
  await render(<TourOverlay onClosed={onClosed} />);
  await act(async () => {
    useTourStore.getState().start();
    for (let i = 0; i < step; i += 1) useTourStore.getState().next();
  });
}

describe('<TourOverlay> closed', () => {
  test('draws nothing', async () => {
    await render(<TourOverlay onClosed={onClosed} />);
    expect(screen.queryByTestId('tour-overlay')).toBeNull();
  });
});

describe('<TourOverlay> the card (FR-003)', () => {
  test('step 1: the title, the words, the position, Next, Skip tour and Close tour', async () => {
    await openAt();
    expect(screen.getByText(TOUR_STEPS[0]!.title)).toBeTruthy();
    expect(screen.getByText(TOUR_STEPS[0]!.body)).toBeTruthy();
    expect(screen.getByText(`1 of ${TOUR_STEPS.length}`)).toBeTruthy();
    expect(screen.getByTestId('tour-next')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
    expect(screen.getByTestId('tour-skip')).toBeTruthy();
    expect(screen.getByLabelText('Close tour')).toBeTruthy();
  });

  test('has exactly one primary: Next', async () => {
    await openAt();
    const primaries = screen
      .getAllByRole('button')
      .filter((button) => button.props.variant === 'primary');
    expect(primaries.map((button) => button.props.testID)).toEqual(['tour-next']);
  });

  test('Next goes one step on, and the last step says Done', async () => {
    await openAt();
    await fireEvent.press(screen.getByTestId('tour-next'));
    expect(screen.getByText(TOUR_STEPS[1]!.title)).toBeTruthy();
    await act(async () => {
      for (let i = 2; i < TOUR_STEPS.length; i += 1) useTourStore.getState().next();
    });
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByText('Next')).toBeNull();
  });

  test('Done closes the tour and tells the layout', async () => {
    await openAt(TOUR_STEPS.length - 1);
    await fireEvent.press(screen.getByTestId('tour-next'));
    expect(useTourStore.getState().open).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('tour-overlay')).toBeNull();
  });
});

describe('<TourOverlay> closing at any moment (FR-005)', () => {
  test.each([
    ['Skip tour', () => screen.getByTestId('tour-skip')],
    ['Close tour', () => screen.getByLabelText('Close tour')],
  ])('%s closes it and tells the layout', async (_name, control) => {
    await openAt(2);
    await fireEvent.press(control());
    expect(useTourStore.getState().open).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  test('the Android back button closes it, and nothing else handles that press', async () => {
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((
      _event: string,
      handler: () => boolean,
    ) => {
      handlers.push(handler);
      return { remove: jest.fn() };
    }) as unknown as typeof BackHandler.addEventListener);
    jest.replaceProperty(Platform, 'OS', 'android');
    await openAt();
    expect(handlers.at(-1)?.()).toBe(true);
    expect(useTourStore.getState().open).toBe(false);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  test('a touch on the dim does not close it and is not let through', async () => {
    await openAt();
    const panel = dims()[0]!;
    await fireEvent.press(panel);
    expect(useTourStore.getState().open).toBe(true);
    expect(panel.props.pointerEvents).not.toBe('none');
  });
});

describe('<TourOverlay> the spotlight (FR-003)', () => {
  test('lights the control of the step: four dim panels around a ring on it', async () => {
    await openAt();
    expect(dims()).toHaveLength(4);
    const [x, y, width, height] = RECTS.totals;
    expect(styleOf('tour-ring')).toMatchObject({
      left: x - SPOTLIGHT_PAD,
      top: y - SPOTLIGHT_PAD,
      width: width + 2 * SPOTLIGHT_PAD,
      height: height + 2 * SPOTLIGHT_PAD,
    });
  });

  test('the lit control cannot be pressed through the overlay', async () => {
    await openAt();
    expect(part('tour-hole-blocker').props.pointerEvents).not.toBe('none');
  });

  test('a step with no target (inside a trip) dims the whole screen and lights nothing', async () => {
    await openAt(3);
    expect(dims()).toHaveLength(1);
    expect(screen.queryByTestId('tour-ring', HIDDEN)).toBeNull();
    expect(screen.getByText(TOUR_STEPS[3]!.title)).toBeTruthy();
  });

  test('a target that cannot be measured does not break the step: the card is still there', async () => {
    registerTourTarget('totals', null);
    await openAt();
    expect(screen.queryByTestId('tour-ring', HIDDEN)).toBeNull();
    expect(screen.getByText(TOUR_STEPS[0]!.title)).toBeTruthy();
    expect(screen.getByTestId('tour-next')).toBeTruthy();
  });
});

describe('<TourOverlay> at the largest text size (FR-008)', () => {
  test('the card is capped to a share of the window and keeps its buttons, however big the words', async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({ ...WINDOW, scale: 3, fontScale: 2 });
    await openAt();
    const scroller = findScroller(screen.toJSON());
    const style = StyleSheet.flatten(scroller?.props?.style as never) as {
      maxHeight: number;
    };
    expect(style.maxHeight).toBe(Math.round(WINDOW.height * 0.6));
    expect(screen.getByTestId('tour-next')).toBeTruthy();
    expect(screen.getByTestId('tour-skip')).toBeTruthy();
    expect(screen.getByLabelText('Close tour')).toBeTruthy();
  });
});

describe('<TourOverlay> accessibility (FR-008)', () => {
  test('is one modal group; the dim and the ring are hidden from assistive technology', async () => {
    await openAt();
    expect(screen.getByTestId('tour-overlay').props.accessibilityViewIsModal).toBe(true);
    for (const dim of dims()) {
      expect(dim.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(dim.props.accessibilityElementsHidden).toBe(true);
    }
    expect(part('tour-ring').props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('the title is announced as a heading', async () => {
    await openAt();
    expect(screen.getByText(TOUR_STEPS[0]!.title).props.accessibilityRole).toBe('header');
  });

  test('the card scrolls inside itself, so large text never pushes a button off screen', async () => {
    await openAt();
    expect(hasType(screen.toJSON(), 'RCTScrollView')).toBe(true);
  });
});
