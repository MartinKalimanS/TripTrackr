/**
 * T091 — the globe's empty state (FR-051; spec Acceptance Scenario 3.6 and
 * Edge Cases, Globe).
 *
 * A traveller with no trips is invited to create the first one, not shown a
 * blank sphere; a traveller whose trips have no stops yet is sent to add one.
 * Both are designed states in the feature 002 sense (FR-027): a title, a
 * reason, and the one action that moves the traveller forward.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { GlobeEmptyState } from '../empty-state';

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

  test('is a designed state, not a blank sphere: no map is mounted behind it', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    expect(screen.queryByTestId(/^mapbox-|^globe-map$/)).toBeNull();
    expect(screen.getByTestId('globe-empty-state')).toBeTruthy();
  });

  test('its one action is a labelled button', async () => {
    await render(<GlobeEmptyState reason="no-trips" onAction={jest.fn()} />);
    const action = screen.getByLabelText('Plan a trip');
    expect(action.props.accessibilityRole).toBe('button');
  });
});

describe('<GlobeEmptyState> — trips without a stop', () => {
  test('explains why the globe is empty and opens the trip list', async () => {
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
    expect(screen.queryByTestId('home-plan-trip')).toBeNull();
  });
});
