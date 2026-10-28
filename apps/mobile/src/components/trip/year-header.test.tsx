/**
 * T540 - `YearHeader` (contract C5-19; FR-030, FR-035): the year in `headline`, then "N trips"
 * and, on the far side, the kilometres, all under the year. It sticks to the top of the list
 * while its rows scroll beneath it, so it has a ground of its own (the canvas) and a hairline,
 * and it is one heading for a screen reader: "2026, 1 trip, 9,380 kilometres". Trips with no
 * stops sit under "No dates yet".
 */
import { render, screen } from '@testing-library/react-native';

import { classesOf } from '../../../test/helpers/host-nodes';
import { YearHeader } from './year-header';

describe('<YearHeader>', () => {
  test('says the year, its trips and its kilometres', async () => {
    await render(<YearHeader year={2026} tripCount={1} distanceKm={9380} />);

    expect(screen.getByText('2026')).toBeTruthy();
    expect(screen.getByText('1 trip')).toBeTruthy();
    expect(screen.getByText('9,380 km')).toBeTruthy();
  });

  test('is ONE heading for a screen reader, with the distance spelled out', async () => {
    await render(<YearHeader year={2026} tripCount={2} distanceKm={9380} />);

    const header = screen.getByTestId('year-header-2026');
    expect(header.props.accessibilityRole).toBe('header');
    expect(header.props.accessible).toBe(true);
    expect(header.props.accessibilityLabel).toBe('2026, 2 trips, 9,380 kilometres');
  });

  test('says nothing of distance for trips that have none', async () => {
    await render(<YearHeader year={2025} tripCount={3} distanceKm={0} />);

    expect(screen.queryByText(/km/)).toBeNull();
    expect(screen.getByTestId('year-header-2025').props.accessibilityLabel).toBe(
      '2025, 3 trips',
    );
  });

  test('trips with no stops are under "No dates yet"', async () => {
    await render(<YearHeader year="none" tripCount={2} distanceKm={0} />);

    expect(screen.getByText('No dates yet')).toBeTruthy();
    expect(screen.getByTestId('year-header-none').props.accessibilityLabel).toBe(
      'No dates yet, 2 trips',
    );
  });

  // Prototype `.year-head`: padding 12 0 4, the ground colour, and no line (the 004 header had a
  // hairline and 8 dp below it; the picture has neither).
  test('has a ground of its own and no line, 12 above and 4 below, so rows scroll beneath it', async () => {
    await render(<YearHeader year={2026} tripCount={1} distanceKm={0} />);

    const classes = classesOf(screen.getByTestId('year-header-2026'));
    expect(classes).toContain('bg-background');
    expect(classes).not.toContain('border-b');
    expect(classes).toEqual(expect.arrayContaining(['pt-3', 'pb-1', 'items-baseline']));
  });

  test('the year is the headline role and the count is muted, the distance subtle', async () => {
    await render(<YearHeader year={2026} tripCount={1} distanceKm={500} />);

    expect(classesOf(screen.getByText('2026'))).toEqual(
      expect.arrayContaining(['text-[22px]', 'text-foreground']),
    );
    expect(classesOf(screen.getByText('1 trip'))).toContain('text-muted');
    expect(classesOf(screen.getByText('500 km'))).toContain('text-subtle');
    expect(classesOf(screen.getByText('1 trip'))).toContain('text-[13px]');
  });
});
