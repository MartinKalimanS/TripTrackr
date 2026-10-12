/**
 * T091, amended by feature 003 (FR-001 to FR-003) — what floats over a globe
 * with nothing to draw (001 FR-051; Acceptance Scenario 3.6 and Edge Cases,
 * Globe); restyled by feature 004 (T428; FR-005, FR-018, FR-029, FR-033, research
 * D4-11).
 *
 * The globe stays; a traveller with no trips is invited to create the first
 * one, a traveller whose trips have no stop is invited to add one. Both are
 * designed states: a title, a reason, and the one primary action that moves the
 * traveller forward. The card sits over map content, so it is an opaque `Card
 * overMap` (hairline, no shadow, no translucency). Under Jest the kit renders plain
 * views carrying the classes they were given: what is pinned is what the cards ASKED
 * for; how a class looks is Uniwind's, on a device (tasks.md T428).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { FocusRing } from '@/theme';

import {
  GlobeEmptyState,
  GlobeNotice,
  OVERLAY_CARD_INSET,
  OVERLAY_MAX_HEIGHT_SHARE,
  overlayMaxHeight,
} from '../empty-state';
import { glyphNamesIn } from '../../../../test/helpers/icons';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    themeName: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    tokens: Colors.light,
  });
});

const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const classesOf = (testID: string) => tokens(screen.getByTestId(testID).props.className);
const styleOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

type Json = { type: string; props: Record<string, unknown>; children?: unknown[] | null };

/** The first host node of a type in the rendered tree. */
function findByType(node: unknown, type: string): Json | undefined {
  if (Array.isArray(node)) return node.map((c) => findByType(c, type)).find(Boolean);
  if (typeof node !== 'object' || node === null) return undefined;
  const json = node as Json;
  return json.type === type ? json : findByType(json.children ?? [], type);
}

describe('<GlobeEmptyState> — no trips yet', () => {
  test('invites the traveller to create their first trip', async () => {
    const onAction = jest.fn();
    await render(<GlobeEmptyState reason="no-trips" onAction={onAction} />);

    expect(screen.getByText('Your globe is waiting for its first trip')).toBeTruthy();
    expect(
      screen.getByText('Add where you are going and the arcs draw themselves.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('home-plan-trip'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('its one action is a labelled button', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    const action = screen.getByLabelText('Plan a trip');
    expect(action.props.accessibilityRole).toBe('button');
    expect(action.props.testID).toBe('home-plan-trip');
  });

  test('the title is a title in the display face, announced as a heading', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    const title = screen.getByText('Your globe is waiting for its first trip');
    expect(tokens(title.props.className)).toEqual(
      expect.arrayContaining(['font-display', 'text-[22px]']),
    );
    expect(title.props.accessibilityRole).toBe('header');
  });

  test('the reason is muted, and wraps in full rather than truncating at large text (FR-029)', async () => {
    await render(<GlobeEmptyState reason="no-stops" onAction={jest.fn()} />);
    const detail = screen.getByText(/^A trip appears on the globe once it has a city/);
    expect(tokens(detail.props.className)).toContain('text-muted');
    expect(detail.props.numberOfLines).toBeUndefined();
  });
});

describe('<GlobeEmptyState> — one primary action (FR-005)', () => {
  test.each([
    ['no-trips', undefined, 'home-plan-trip', 'Plan a trip'],
    ['no-stops', 'Alps, spring', 'home-add-stop', 'Add a first stop'],
    ['no-stops', undefined, 'home-open-trips', 'Open your trips'],
  ] as const)('%s / %s: a single primary button, %s', async (reason, trip, id, label) => {
    await render(
      <GlobeEmptyState reason={reason} tripTitle={trip} onAction={jest.fn()} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.testID).toBe(id);
    expect(buttons[0].props.accessibilityLabel).toBe(label);
    expect(buttons[0].props.variant).toBe('primary');
  });
});

describe('<GlobeEmptyState> — a card over the map, never a replacement for it (FR-018, FR-033)', () => {
  test('is the opaque surface with a hairline: bg-surface, border, border-border', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    expect(classesOf('globe-empty-state')).toEqual(
      expect.arrayContaining(['bg-surface', 'border', 'border-border']),
    );
  });

  test('casts no shadow onto the map and is never translucent', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    const classes = classesOf('globe-empty-state');
    expect(classes).toContain('shadow-none');
    expect(classes.filter((token) => /(^|:)(inset-|drop-)?shadow/.test(token))).toEqual([
      'shadow-none',
    ]);
    expect(classes.filter((token) => token.includes('/'))).toEqual([]);
    const style = styleOf('globe-empty-state');
    expect(style.boxShadow).toBeUndefined();
    expect(style.elevation).toBeUndefined();
    expect(style.opacity).toBeUndefined();
    expect(style.backgroundColor).toBeUndefined();
  });

  test('mounts no map of its own: the screen owns the one globe', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    expect(screen.queryByTestId(/^mapbox-|^globe-map$/)).toBeNull();
  });

  test('stays a compact card: a capped width, never the whole screen', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    expect(classesOf('globe-empty-state')).toEqual(
      expect.arrayContaining(['self-stretch', 'max-w-md']),
    );
  });

  test('keeps every word reachable at the largest text size: its own scroller, capped in height', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    const scroller = findByType(screen.toJSON(), 'RCTScrollView') as Json;
    const style = StyleSheet.flatten(scroller.props.style as never) as {
      maxHeight: number;
    };
    // 60% of the window less the card's own 16 dp padding either side: the globe
    // stays in view and in reach.
    const { height } = Dimensions.get('window');
    expect(style.maxHeight).toBe(overlayMaxHeight(height));
    // A card that fits does not rubber-band.
    expect(scroller.props.alwaysBounceVertical).toBe(false);
  });

  test('the cap is a share of the window, from one constant', () => {
    expect(OVERLAY_MAX_HEIGHT_SHARE).toBeGreaterThan(0);
    expect(OVERLAY_MAX_HEIGHT_SHARE).toBeLessThan(1);
    expect(overlayMaxHeight(1000)).toBe(Math.round(1000 * OVERLAY_MAX_HEIGHT_SHARE));
    expect(overlayMaxHeight(0)).toBe(0);
    expect(overlayMaxHeight(-50)).toBe(0);
  });

  test('owns its padding: none on the card, the inset on the scroller content', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    // The kit surface pads 16 dp by class; an explicit style says what this card means,
    // and with nothing outside the scroller the cap IS the card's whole height.
    expect(styleOf('globe-empty-state').padding).toBe(0);
    const scroller = findByType(screen.toJSON(), 'RCTScrollView') as Json;
    expect(
      StyleSheet.flatten(scroller.props.contentContainerStyle as never),
    ).toMatchObject({ padding: OVERLAY_CARD_INSET });
  });

  test('the inset is a gutter for a focus ring, which the scroller would otherwise clip', () => {
    expect(OVERLAY_CARD_INSET).toBeGreaterThanOrEqual(FocusRing.width + FocusRing.offset);
  });
});

describe('<GlobeEmptyState> — what a screen reader meets (FR-030)', () => {
  test('is not one merged focus stop: the title, the reason and the button stay separate', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    const card = screen.getByTestId('globe-empty-state');
    expect(card.props.accessible).toBeUndefined();
    expect(card.props.accessibilityLabel).toBeUndefined();
    expect(card.props.accessibilityRole).toBeUndefined();
    // The button is its own, labelled focus stop.
    const action = screen.getByTestId('home-plan-trip');
    expect(action.props.accessible).toBe(true);
    expect(action.props.accessibilityLabel).toBe('Plan a trip');
  });

  test('presses call onAction with no arguments: the press event is not its business', async () => {
    const onAction = jest.fn();
    await render(<GlobeEmptyState reason="no-trips" onAction={onAction} />);
    await fireEvent.press(screen.getByTestId('home-plan-trip'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith();
  });
});

describe('<GlobeEmptyState> — trips without a stop', () => {
  test('several trips: explains why and opens the trip list', async () => {
    const onAction = jest.fn();
    await render(<GlobeEmptyState reason="no-stops" onAction={onAction} />);

    expect(screen.getByText('Your trips need a first stop')).toBeTruthy();
    expect(
      screen.getByText(
        'A trip appears on the globe once it has a city. Add one and its arcs draw themselves.',
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('home-open-trips'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Open your trips')).toBeTruthy();
    expect(screen.queryByTestId('home-plan-trip')).toBeNull();
  });

  test('one trip: names it and offers to add its first stop', async () => {
    const onAction = jest.fn();
    await render(
      <GlobeEmptyState reason="no-stops" tripTitle="Alps, spring" onAction={onAction} />,
    );

    expect(screen.getByText('Your trip needs a first stop')).toBeTruthy();
    expect(
      screen.getByText('“Alps, spring” appears on the globe once it has a city.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('home-add-stop'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Add a first stop')).toBeTruthy();
    expect(screen.queryByTestId('home-open-trips')).toBeNull();
  });
});

describe('<GlobeNotice> — a plain-words problem shown over the globe', () => {
  test('says what happened, offers no action, and is announced', async () => {
    await render(
      <GlobeNotice title="Couldn’t read your trips" detail="Restart the app." />,
    );

    expect(screen.getByText('Couldn’t read your trips')).toBeTruthy();
    expect(screen.getByText('Restart the app.')).toBeTruthy();
    expect(screen.getByTestId('globe-notice').props.accessibilityRole).toBe('alert');
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('is ONE announced alert: accessible, named by its title and its reason (FR-030)', async () => {
    await render(
      <GlobeNotice title="Couldn’t read your trips" detail="Restart the app." />,
    );
    const alert = screen.getByTestId('globe-notice');
    expect(alert.props.accessible).toBe(true);
    expect(alert.props.accessibilityRole).toBe('alert');
    expect(alert.props.accessibilityLabel).toBe(
      'Couldn’t read your trips. Restart the app.',
    );
  });

  test('without a reason, the title is the whole announcement', async () => {
    await render(<GlobeNotice title="Couldn’t read your trips" />);
    const alert = screen.getByTestId('globe-notice');
    expect(alert.props.accessible).toBe(true);
    expect(alert.props.accessibilityLabel).toBe('Couldn’t read your trips');
  });

  test('the alert is only a layout box: the card inside paints, it does not speak', async () => {
    await render(<GlobeNotice title="Couldn’t read your trips" detail="Restart." />);
    expect(classesOf('globe-notice')).toEqual(['self-stretch', 'max-w-md']);
    const card = screen.getByTestId('globe-notice-card');
    expect(card.props.accessible).toBeUndefined();
    expect(card.props.accessibilityRole).toBeUndefined();
    expect(card.props.accessibilityLabel).toBeUndefined();
  });

  test('is not colour alone: a leading alert icon, the title in the danger ink', async () => {
    await render(<GlobeNotice title="Couldn’t read your trips" detail="Restart." />);
    expect(glyphNamesIn()).toEqual(['alert']);
    expect(
      tokens(screen.getByText('Couldn’t read your trips').props.className),
    ).toContain('text-danger');
    expect(tokens(screen.getByText('Restart.').props.className)).toContain('text-muted');
  });

  test('needs no detail', async () => {
    await render(<GlobeNotice title="Couldn’t read your trips" />);
    expect(screen.getByText('Couldn’t read your trips')).toBeTruthy();
  });

  test('is an opaque hairline card with no shadow, like the invitation (FR-018, FR-033)', async () => {
    await render(<GlobeNotice title="Couldn’t read your trips" />);
    const classes = classesOf('globe-notice-card');
    expect(classes).toEqual(
      expect.arrayContaining(['bg-surface', 'border', 'border-border', 'shadow-none']),
    );
    expect(classes.filter((token) => token.includes('/'))).toEqual([]);
    expect(styleOf('globe-notice-card').boxShadow).toBeUndefined();
    expect(styleOf('globe-notice-card').padding).toBe(0);
  });
});

describe('Globe cards — built on the Atlas adapters only', () => {
  test('imports none of the retired primitives, never the kit, no colour literal', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('../empty-state'), 'utf8') as string;
    expect(source).not.toMatch(
      /from '@\/components\/(themed-text|themed-view|ui\/surface|ui\/pressable-surface)'/,
    );
    expect(source).not.toMatch(/from 'heroui-native|from 'uniwind/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/);
    expect(source).not.toMatch(/Colors\[/);
  });
});
