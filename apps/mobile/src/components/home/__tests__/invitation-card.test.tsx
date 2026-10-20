/**
 * `InvitationCard` - what floats over the globe when it has nothing to draw (feature 005,
 * T537; contract C5-23; FR-020, FR-018, FR-081): the existing `globe-empty-state` card, one
 * primary action, and, for a traveller with NO trips, three tilted empty photo frames over its
 * top edge and one serif accent word in the headline. Stock photographs are never shipped.
 * Every id and name of the card is as it was (flows 03, 04 and 05 tap `home-plan-trip`,
 * `home-add-stop` and `home-open-trips` and read the headlines).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { liftOf } from '@/theme';

import { glyphsIn } from '../../../../test/helpers/icons';

import { appearance } from '../../../../test/helpers/appearance';
import { ART_OVERHANG, InvitationCard } from '../invitation-card';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock };
};

beforeEach(() => {
  useAppearance.mockReturnValue(appearance());
  mockToast.show.mockClear();
});

const HIDDEN = { includeHiddenElements: true };

type Json = { type: string; props: Record<string, unknown>; children?: unknown[] | null };

/** The first host node of a type in the rendered tree. */
function findByType(node: unknown, type: string): Json | undefined {
  if (Array.isArray(node)) return node.map((c) => findByType(c, type)).find(Boolean);
  if (typeof node !== 'object' || node === null) return undefined;
  const json = node as Json;
  return json.type === type ? json : findByType(json.children ?? [], type);
}

describe('<InvitationCard> - no trips (FR-020)', () => {
  test('keeps the card, its headline and its one primary action, by id and by name', async () => {
    const onAction = jest.fn();
    await render(<InvitationCard reason="no-trips" onAction={onAction} />);
    expect(screen.getByTestId('globe-empty-state')).toBeTruthy();
    expect(screen.getByText('Your globe is waiting for its first trip')).toBeTruthy();
    const primary = screen.getByTestId('home-plan-trip');
    expect(primary.props.accessibilityLabel).toBe('Plan a trip');
    expect(primary.props.variant).toBe('primary');
    await fireEvent.press(primary);
    expect(onAction).toHaveBeenCalledTimes(1);
    // One primary: the other control is the pictured text button (below).
    const primaries = screen
      .getAllByRole('button')
      .filter((button) => button.props.variant === 'primary');
    expect(primaries).toHaveLength(1);
  });

  test('draws three empty photo frames over the card, and no photograph', async () => {
    await render(<InvitationCard reason="no-trips" onAction={jest.fn()} />);
    for (const index of [0, 1, 2]) {
      expect(
        screen.getByTestId(`home-invitation-art-frame-${index}`, HIDDEN),
      ).toBeTruthy();
    }
    expect(screen.queryByTestId('home-invitation-art-frame-3', HIDDEN)).toBeNull();
  });

  test('the frames are decoration: hidden from assistive technology and they take no touch', async () => {
    await render(<InvitationCard reason="no-trips" onAction={jest.fn()} />);
    const art = screen.getByTestId('home-invitation-art', HIDDEN);
    expect(art.props.accessibilityElementsHidden).toBe(true);
    expect(art.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(art.props.pointerEvents).toBe('none');
  });

  test('the headline has ONE accent word, in the serif, and still reads whole', async () => {
    await render(<InvitationCard reason="no-trips" onAction={jest.fn()} />);
    const accent = screen.getByText('first');
    expect(String(accent.props.className).split(/\s+/)).toContain('font-serif-italic');
    expect(screen.getByText('Your globe is waiting for its first trip')).toBeTruthy();
  });

  test('overhangs the top of the card by 64 dp: the frames sit in a slot over the card, not in its flow', async () => {
    await render(<InvitationCard reason="no-trips" onAction={jest.fn()} />);
    const wrap = StyleSheet.flatten(screen.getByTestId('home-invitation').props.style);
    expect(wrap.paddingTop).toBe(ART_OVERHANG);
    expect(ART_OVERHANG).toBe(64);
    const slot = screen.getByTestId('home-invitation-art-slot', HIDDEN);
    expect(StyleSheet.flatten(slot.props.style)).toMatchObject({
      position: 'absolute',
      top: 0,
    });
    expect(slot.props.pointerEvents).toBe('none');
  });
});

describe('<InvitationCard> - as home-empty.png draws it', () => {
  test('"Find trips in my photos" is a coming-soon text button after the primary: a toast and nothing else', async () => {
    const onAction = jest.fn();
    await render(<InvitationCard reason="no-trips" onAction={onAction} />);
    const find = screen.getByTestId('coming-soon-find-trips');
    expect(find.props.accessibilityRole).toBe('button');
    expect(find.props.accessibilityLabel).toBe('Find trips in my photos');
    expect(find.props.accessibilityHint).toBe('Not available yet');
    expect(find.props.variant).toBe('ghost');
    const order = screen.getAllByRole('button').map((button) => button.props.testID);
    expect(order).toEqual(['home-plan-trip', 'coming-soon-find-trips']);
    await fireEvent.press(find);
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(mockToast.show.mock.calls[0]![0]).toMatchObject({ id: 'coming-soon' });
    expect(onAction).not.toHaveBeenCalled();
  });

  test('the card is padded 20 at the sides and 76 at the top (the frames hang 48 into it), centred, 8 dp apart', async () => {
    await render(<InvitationCard reason="no-trips" onAction={jest.fn()} />);
    const scroller = findByType(screen.toJSON(), 'RCTScrollView');
    const content = StyleSheet.flatten(scroller!.props.contentContainerStyle as never);
    expect(content).toMatchObject({
      paddingHorizontal: 20,
      paddingTop: 76,
      paddingBottom: 16,
      gap: 8,
      alignItems: 'center',
    });
  });

  test('is radius 24 on the second lift, and its words are centred', async () => {
    await render(<InvitationCard reason="no-trips" onAction={jest.fn()} />);
    const card = StyleSheet.flatten(screen.getByTestId('globe-empty-state').props.style);
    expect(card.borderRadius).toBe(24);
    expect(card.boxShadow).toEqual(liftOf('light', 'lift2'));
    for (const words of [
      screen.getByText('Your globe is waiting for its first trip'),
      screen.getByText('Add where you are going and the arcs draw themselves.'),
    ]) {
      expect(String(words.props.className).split(' ')).toContain('text-center');
    }
  });

  test('the primary spans the card (the picture), not a left-aligned pill', async () => {
    await render(<InvitationCard reason="no-trips" onAction={jest.fn()} />);
    const classes = String(screen.getByTestId('home-plan-trip').props.className);
    expect(classes.split(' ')).toContain('self-stretch');
    expect(classes.split(' ')).not.toContain('self-start');
  });

  test('the frames are cream placeholders with a photo glyph, never a photograph', async () => {
    await render(<InvitationCard reason="no-trips" onAction={jest.fn()} />);
    for (const index of [0, 1, 2]) {
      const frame = screen.getByTestId(`home-invitation-art-frame-${index}`, HIDDEN);
      expect(String(frame.props.className).split(' ')).toContain('bg-surface-secondary');
    }
    expect(
      glyphsIn(screen.toJSON()).filter((glyph) => glyph.name === 'image'),
    ).toHaveLength(3);
  });

  test('the frames are 84 by 108 dp, over the card by 64 dp, the middle one 8 dp higher and on top', async () => {
    await render(<InvitationCard reason="no-trips" onAction={jest.fn()} />);
    const frames = [0, 1, 2].map((index) =>
      String(
        screen.getByTestId(`home-invitation-art-frame-${index}`, HIDDEN).props.className,
      ),
    );
    for (const classes of frames) {
      expect(classes).toContain('h-[108px]');
      expect(classes).toContain('w-[84px]');
    }
    const middle = StyleSheet.flatten(
      screen.getByTestId('home-invitation-art-frame-1', HIDDEN).props.style,
    );
    expect(middle).toMatchObject({ top: -8, zIndex: 2 });
  });
});

describe('<InvitationCard> - trips but no stop (003 FR-002)', () => {
  test('one trip: the card opens that trip, with no frames', async () => {
    const onAction = jest.fn();
    await render(
      <InvitationCard reason="no-stops" tripTitle="Alps, spring" onAction={onAction} />,
    );
    expect(screen.getByText('Your trip needs a first stop')).toBeTruthy();
    expect(screen.queryByTestId('home-invitation-art', HIDDEN)).toBeNull();
    await fireEvent.press(screen.getByTestId('home-add-stop'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('several trips: the card opens the list, with no frames', async () => {
    await render(<InvitationCard reason="no-stops" onAction={jest.fn()} />);
    expect(screen.getByText('Your trips need a first stop')).toBeTruthy();
    expect(screen.getByTestId('home-open-trips')).toBeTruthy();
    expect(screen.queryByTestId('home-invitation-art', HIDDEN)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByTestId('coming-soon-find-trips')).toBeNull();
  });
});
