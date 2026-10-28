/** `useNow` (T549): the clock of the "just synced" tick, read without rendering impurely. */
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { refreshNow, useNow } from '@/features/photos/use-now';

function Clock({ changed }: { changed: unknown }) {
  return <Text testID="clock">{String(useNow(changed))}</Text>;
}

afterEach(() => jest.useRealTimers());

describe('useNow', () => {
  test('is the time of mounting, and moves on when what it watches changes', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-14T12:00:00.000Z') });
    await render(<Clock changed="a" />);
    expect(screen.getByTestId('clock')).toHaveTextContent(
      String(Date.parse('2026-10-14T12:00:00.000Z')),
    );

    jest.setSystemTime(new Date('2026-10-14T12:10:00.000Z'));
    // Nothing changed: nothing runs, so the time does not tick on its own.
    expect(screen.getByTestId('clock')).toHaveTextContent(
      String(Date.parse('2026-10-14T12:00:00.000Z')),
    );

    await screen.rerender(<Clock changed="b" />);
    expect(screen.getByTestId('clock')).toHaveTextContent(
      String(Date.parse('2026-10-14T12:10:00.000Z')),
    );
  });

  test('every subscriber hears a refresh, and an unmounted one is let go', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-14T12:00:00.000Z') });
    await render(<Clock changed="a" />);
    jest.setSystemTime(new Date('2026-10-14T12:01:00.000Z'));
    await act(async () => refreshNow());
    expect(screen.getByTestId('clock')).toHaveTextContent(
      String(Date.parse('2026-10-14T12:01:00.000Z')),
    );

    await screen.unmount();
    expect(() => refreshNow()).not.toThrow();
  });
});
