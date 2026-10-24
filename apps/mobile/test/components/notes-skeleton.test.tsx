/**
 * `NotesSkeleton` (F9, T551; UI-SPEC 9.3): ONE named progress region, no text of its own, a day
 * heading's bone and two note-shaped tiles; never an empty state.
 */
import { render, screen } from '@testing-library/react-native';

import { NotesSkeleton } from '@/components/trip/notes-skeleton';

describe('<NotesSkeleton>', () => {
  test('is one progressbar named from the caller, with no words of its own', async () => {
    await render(<NotesSkeleton label="Loading notes" />);

    const region = screen.getByLabelText('Loading notes');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.toJSON() && JSON.stringify(screen.toJSON())).not.toMatch(
      /No notes yet|Loading notes"\s*,\s*"children":\["/,
    );
  });

  test('draws two tiles with the real card’s corner and padding', async () => {
    await render(<NotesSkeleton label="Loading notes" />);
    const classes = JSON.stringify(screen.toJSON());
    expect(classes.match(/rounded-2xl/g)).toHaveLength(2);
    expect(classes).toContain('"padding":16');
  });
});
