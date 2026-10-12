/**
 * T543 - `ProgressRow` (contract C5-20; spec FR-038, FR-026, FR-070; screens.md "Trip"): the one
 * row beneath the hero. The derived status chip, "Day 3 of 8" with its dots for an active
 * trip, the home currency and, at the end, the one global sync chip. It keeps the id
 * `trip-header-row` and the status chip's own words ("Active", "Planning", "Past"), which the
 * Maestro flows assert as whole strings, so "Day 3 of 8" is a SIBLING of the chip and never
 * part of its text.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { ProgressRow } from '@/components/trip/progress-row';

const hidden = { includeHiddenElements: true };

function row(props: Partial<React.ComponentProps<typeof ProgressRow>> = {}) {
  return (
    <ProgressRow
      status="active"
      dayOf={{ day: 3, of: 8 }}
      currency="EUR"
      syncState={{ kind: 'synced' }}
      {...props}
    />
  );
}

describe('<ProgressRow>', () => {
  test('is the row `trip-header-row` and holds the status chip, in the words the flows assert', async () => {
    await render(row());
    const header = within(screen.getByTestId('trip-header-row'));
    const chip = header.getByTestId('status-pill-active');
    expect(chip).toBeTruthy();
    // The whole string a flow matches: "Active", not "Active · Day 3 of 8".
    expect(header.getByText('Active')).toBeTruthy();
    expect(header.getByLabelText('Status: Active')).toBeTruthy();
  });

  test.each([
    ['planning', 'Planning'],
    ['past', 'Past'],
  ] as const)('shows %s as "%s" and no day progress', async (status, words) => {
    await render(row({ status, dayOf: null }));
    expect(screen.getByTestId(`status-pill-${status}`)).toBeTruthy();
    expect(screen.getByText(words)).toBeTruthy();
    expect(screen.queryByTestId('trip-progress-day')).toBeNull();
    expect(screen.queryByTestId('trip-progress-dots', hidden)).toBeNull();
  });

  test('an active trip says "Day 3 of 8" in words, as a sibling of the chip', async () => {
    await render(row());
    expect(screen.getByTestId('trip-progress-day')).toHaveTextContent('Day 3 of 8');
    expect(screen.getByText('Active').parent?.props.testID).not.toBe('trip-progress-day');
  });

  test('an active trip with no computable day (damaged dates) shows the chip alone', async () => {
    await render(row({ dayOf: null }));
    expect(screen.getByTestId('status-pill-active')).toBeTruthy();
    expect(screen.queryByTestId('trip-progress-day')).toBeNull();
  });

  test('draws one dot per day: done filled, today ringed, the rest empty, all decorative', async () => {
    await render(row());
    const dots = screen.getByTestId('trip-progress-dots', hidden);
    expect(dots.props.accessibilityElementsHidden).toBe(true);
    expect(dots.props.importantForAccessibility).toBe('no-hide-descendants');
    const kinds = ['done', 'done', 'now', 'rest', 'rest', 'rest', 'rest', 'rest'];
    kinds.forEach((kind, index) => {
      expect(
        screen.getByTestId(`trip-progress-dot-${index}-${kind}`, hidden),
      ).toBeTruthy();
    });
    expect(within(dots).getAllByTestId(/^trip-progress-dot-/, hidden)).toHaveLength(8);
  });

  test('says the home currency, as the 004 row did', async () => {
    await render(row());
    expect(within(screen.getByTestId('trip-header-row')).getByText('EUR')).toBeTruthy();
  });

  test('marks a trip that only exists on this device with the per-record marker, in words', async () => {
    await render(row({ pending: true }));
    expect(
      within(screen.getByTestId('trip-header-row')).getByLabelText('Sync pending'),
    ).toBeTruthy();
  });

  test('draws no per-record marker for a trip the server already has', async () => {
    await render(row({ pending: false }));
    expect(screen.queryByLabelText('Sync pending')).toBeNull();
  });

  test('the sync chip is the last thing in the row and absent when everything is synchronised', async () => {
    await render(row({ syncState: { kind: 'waiting', count: 3 } }));
    const header = screen.getByTestId('trip-header-row');
    const chip = within(header).getByTestId('sync-chip');
    expect(chip).toBeTruthy();
    expect(chip.props.accessibilityLabel).toBe('3 changes waiting to sync');
  });

  test('draws no chip when everything is synchronised', async () => {
    await render(row({ syncState: { kind: 'synced' } }));
    expect(screen.queryByTestId('sync-chip')).toBeNull();
  });

  test('a failed sync is a Retry button that calls the handler it was given', async () => {
    const onRetry = jest.fn();
    await render(row({ syncState: { kind: 'failed', count: 2 }, onRetry }));
    const chip = screen.getByTestId('sync-chip');
    expect(chip.props.accessibilityRole).toBe('button');
    await fireEvent.press(chip);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('wraps at large text instead of clipping, and its height is a minimum (FR-074)', async () => {
    await render(row({ syncState: { kind: 'waiting', count: 1 } }));
    const style = screen.getByTestId('trip-header-row').props.style;
    const flat = Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<
      string,
      unknown
    >;
    expect(flat.height).toBeUndefined();
    const classes = String(screen.getByTestId('trip-header-row').props.className);
    expect(classes).toContain('flex-wrap');
    expect(classes).toContain('min-h-[36px]');
  });
});
