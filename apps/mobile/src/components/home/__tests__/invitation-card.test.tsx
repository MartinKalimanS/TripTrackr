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

import { appearance } from '../../../../test/helpers/appearance';
import { ART_OVERHANG, InvitationCard } from '../invitation-card';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

beforeEach(() => {
  useAppearance.mockReturnValue(appearance());
});

const HIDDEN = { includeHiddenElements: true };

describe('<InvitationCard> - no trips (FR-020)', () => {
  test('keeps the card, its headline and its one primary action, by id and by name', async () => {
    const onAction = jest.fn();
    await render(<InvitationCard reason="no-trips" onAction={onAction} />);
    expect(screen.getByTestId('globe-empty-state')).toBeTruthy();
    expect(screen.getByText('Your globe is waiting for its first trip')).toBeTruthy();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.props.testID).toBe('home-plan-trip');
    expect(buttons[0]!.props.accessibilityLabel).toBe('Plan a trip');
    await fireEvent.press(buttons[0]!);
    expect(onAction).toHaveBeenCalledTimes(1);
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
  });
});
