/**
 * T544 - `AreasStrip` (contract C5-20; spec FR-039, FR-070, FR-075; screens.md "Trip"): the
 * five areas of a trip. Four count tiles (Photos, Notes, Expenses, Documents) with a lock on
 * the two only the traveller can see, one line saying so, and the Offline maps row. Every id
 * and accessible name of the 004 row of chips is kept (`trip-links`, `trip-open-<segment>`,
 * "Photos for this trip", ...), and a count is said as the control's VALUE after its name, so
 * what a screen reader announces for the control does not change (FR-075).
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { AreasStrip } from '@/components/trip/areas-strip';

import { resetKeyboard, setWindow } from '../helpers/keyboard';

const hidden = { includeHiddenElements: true };

function strip(props: Partial<React.ComponentProps<typeof AreasStrip>> = {}) {
  return (
    <AreasStrip
      counts={{ photos: 128, notes: 6, documents: 4 }}
      spending={{ total: '842.00', currency: 'EUR' }}
      onOpen={jest.fn()}
      {...props}
    />
  );
}

const SEGMENTS = [
  ['photos', 'Photos', 'Photos for this trip'],
  ['notes', 'Notes', 'Notes for this trip'],
  ['expenses', 'Expenses', 'Spending for this trip'],
  ['documents', 'Documents', 'Travel documents for this trip'],
  ['offline-maps', 'Offline maps', 'Offline maps for this trip'],
] as const;

afterEach(() => resetKeyboard());

describe('<AreasStrip> keeps what the 004 row had', () => {
  test('is `trip-links` and holds the five controls, each with its id', async () => {
    await render(strip());
    const links = within(screen.getByTestId('trip-links'));
    for (const [segment] of SEGMENTS) {
      expect(links.getByTestId(`trip-open-${segment}`)).toBeTruthy();
    }
    expect(links.getAllByRole('button')).toHaveLength(5);
  });

  test.each(SEGMENTS)(
    '"%s" is named "%s" in words that did not change: "%s"',
    async (segment, text, name) => {
      await render(strip());
      const control = screen.getByTestId(`trip-open-${segment}`);
      expect(control.props.accessibilityLabel).toBe(name);
      expect(control.props.accessibilityRole).toBe('button');
      expect(within(control).getByText(text)).toBeTruthy();
    },
  );

  test.each(SEGMENTS)('"%s" opens its own screen through onOpen', async (segment) => {
    const onOpen = jest.fn();
    await render(strip({ onOpen }));
    await fireEvent.press(screen.getByTestId(`trip-open-${segment}`));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(segment);
  });
});

describe('<AreasStrip> the figures', () => {
  test('say the count in the tile and, after the name, as the value', async () => {
    await render(strip());
    const photos = screen.getByTestId('trip-open-photos');
    expect(within(photos).getByText('128')).toBeTruthy();
    expect(photos.props.accessibilityValue.text).toBe('128');
    expect(screen.getByTestId('trip-open-notes').props.accessibilityValue.text).toBe('6');
    expect(screen.getByTestId('trip-open-documents').props.accessibilityValue.text).toBe(
      '4, only you can see this',
    );
  });

  test("Expenses shows the exact total in the home currency, in the device's format", async () => {
    await render(strip());
    const expenses = screen.getByTestId('trip-open-expenses');
    expect(within(expenses).getByText('€842.00')).toBeTruthy();
    expect(expenses.props.accessibilityValue.text).toBe('€842.00, only you can see this');
  });

  test('a trip with nothing yet shows zeros in the tiles (FR-042)', async () => {
    await render(
      strip({
        counts: { photos: 0, notes: 0, documents: 0 },
        spending: { total: '0.00', currency: 'EUR' },
      }),
    );
    expect(within(screen.getByTestId('trip-open-photos')).getByText('0')).toBeTruthy();
    expect(
      within(screen.getByTestId('trip-open-expenses')).getByText('€0.00'),
    ).toBeTruthy();
  });
});

describe('<AreasStrip> privacy (FR-039, FR-070)', () => {
  test('Expenses and Documents carry the lock; Photos and Notes do not', async () => {
    await render(strip());
    expect(screen.getByTestId('trip-open-expenses-lock', hidden)).toBeTruthy();
    expect(screen.getByTestId('trip-open-documents-lock', hidden)).toBeTruthy();
    expect(screen.queryByTestId('trip-open-photos-lock', hidden)).toBeNull();
    expect(screen.queryByTestId('trip-open-notes-lock', hidden)).toBeNull();
    expect(screen.queryByTestId('trip-open-offline-maps-lock', hidden)).toBeNull();
  });

  test('says in one line, once, that they are only visible to the traveller', async () => {
    await render(strip());
    const line = screen.getByTestId('trip-privacy-line');
    expect(line).toHaveTextContent('Expenses and documents are only visible to you.');
    expect(screen.getAllByText(/only visible to you/)).toHaveLength(1);
  });

  test('the line is aqua ink with a decorative lock, not colour alone', async () => {
    await render(strip());
    expect(String(screen.getByTestId('trip-privacy-line').props.className)).toContain(
      'text-aqua-ink',
    );
  });
});

describe('<AreasStrip> needs attention (FR-043)', () => {
  test('a failed upload rings the Photos tile and says so', async () => {
    await render(strip({ warnPhotos: true }));
    expect(screen.getByTestId('trip-open-photos-warn', hidden)).toBeTruthy();
    expect(screen.getByTestId('trip-open-photos').props.accessibilityValue.text).toBe(
      '128, needs attention',
    );
    expect(screen.queryByTestId('trip-open-notes-warn', hidden)).toBeNull();
  });

  test('no warning by default', async () => {
    await render(strip());
    expect(screen.queryByTestId('trip-open-photos-warn', hidden)).toBeNull();
  });
});

describe('<AreasStrip> layout (FR-039, FR-074)', () => {
  const widthOf = (segment: string) =>
    StyleSheet.flatten(screen.getByTestId(`trip-tile-${segment}`).props.style).width;

  test('four columns at the default text size', async () => {
    setWindow({ width: 390, height: 844, fontScale: 1 });
    await render(strip());
    for (const segment of ['photos', 'notes', 'expenses', 'documents']) {
      expect(widthOf(segment)).toBe('25%');
    }
  });

  test('two columns from a font scale of 1.15', async () => {
    setWindow({ width: 390, height: 844, fontScale: 1.15 });
    await render(strip());
    expect(widthOf('photos')).toBe('50%');
  });

  test('two columns at the largest text size, and every tile is still there', async () => {
    setWindow({ width: 390, height: 844, fontScale: 2 });
    await render(strip());
    expect(widthOf('documents')).toBe('50%');
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });

  test('the Offline maps row is beneath the tiles, in the order of the screen', async () => {
    await render(strip());
    const ids = screen
      .getAllByTestId(
        /^trip-(open-(photos|notes|expenses|documents|offline-maps)|privacy-line)$/,
      )
      .map((node) => node.props.testID);
    expect(ids).toEqual([
      'trip-open-photos',
      'trip-open-notes',
      'trip-open-expenses',
      'trip-open-documents',
      'trip-privacy-line',
      'trip-open-offline-maps',
    ]);
  });

  test('has no fixed height anywhere on the strip', async () => {
    await render(strip());
    const style = StyleSheet.flatten(screen.getByTestId('trip-links').props.style) ?? {};
    expect(style.height).toBeUndefined();
  });
});
