/**
 * T091, amended by feature 003 (FR-001 to FR-003) — what floats over a globe
 * with nothing to draw (001 FR-051; Acceptance Scenario 3.6 and Edge Cases,
 * Globe).
 *
 * The globe stays; a traveller with no trips is invited to create the first
 * one, a traveller whose trips have no stop is invited to add one. Both are
 * designed states in the feature 002 sense (FR-027): a title, a reason, and the
 * one action that moves the traveller forward. The card sits over map content,
 * so 002 contract C12 decides its treatment: opaque and bordered, with no
 * shadow cast onto the map.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { GlobeEmptyState, GlobeNotice } from '../empty-state';

function styleOf(node: { props: Record<string, unknown> }) {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
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
  });
});

describe('<GlobeEmptyState> — a card over the map, never a replacement for it (C12)', () => {
  test('is opaque and bordered, with no shadow cast onto the map (FR-003)', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    const card = styleOf(screen.getByTestId('globe-empty-state'));

    expect(card.boxShadow).toBeUndefined();
    expect(card.borderWidth).toBeGreaterThan(0);
    expect(card.backgroundColor).toEqual(expect.any(String));
  });

  test('mounts no map of its own: the screen owns the one globe', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    expect(screen.queryByTestId(/^mapbox-|^globe-map$/)).toBeNull();
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

  test('is a flat, bordered card like the invitation (C12)', async () => {
    await render(<GlobeNotice title="Couldn’t read your trips" />);
    const card = styleOf(screen.getByTestId('globe-notice'));
    expect(card.boxShadow).toBeUndefined();
    expect(card.borderWidth).toBeGreaterThan(0);
  });
});
