/**
 * T422 - FR-025, FR-030, contract C4-8 (`InlineError`). A write failure is said in words,
 * announced as an alert, and not by colour alone: a leading alert icon accompanies the
 * danger ink. The role, the test id and the text stay exactly where the screens and the
 * Maestro flows find them.
 */
import { render, screen } from '@testing-library/react-native';

import { InlineError } from './inline-error';
import { glyphId, glyphsIn } from '../../../test/helpers/icons';

const classesOf = (node: { props: Record<string, unknown> }) =>
  String(node.props.className ?? '').split(/\s+/);

describe('<InlineError>', () => {
  test.each([[null], [''], [undefined as unknown as null]])(
    'draws nothing when the message is %p',
    async (message) => {
      await render(<InlineError testID="add-trip-error" message={message} />);
      expect(screen.toJSON()).toBeNull();
      expect(screen.queryByTestId('add-trip-error')).toBeNull();
    },
  );

  test('is an alert carrying the test id and the message', async () => {
    await render(<InlineError testID="add-trip-error" message="Could not be saved." />);

    const alert = screen.getByTestId('add-trip-error');
    expect(alert.props.accessibilityRole).toBe('alert');
    expect(alert.props.accessible).toBe(true);
    expect(alert).toHaveTextContent('Could not be saved.');
    expect(screen.getByRole('alert')).toBe(alert);
  });

  test('reads in the danger ink', async () => {
    await render(<InlineError testID="e" message="Could not be saved." />);
    expect(classesOf(screen.getByText('Could not be saved.'))).toContain('text-danger');
  });

  test('is not colour alone: a decorative alert icon leads the words', async () => {
    await render(<InlineError testID="e" message="Could not be saved." />);

    expect(glyphsIn()).toEqual([expect.objectContaining({ name: 'alert', size: 16 })]);
    expect(screen.queryByTestId(glyphId('alert'))).toBeNull();
  });

  test('wraps a long message beside the icon instead of clipping it', async () => {
    await render(<InlineError testID="e" message="A long message." />);
    expect(classesOf(screen.getByText('A long message.'))).toContain('shrink');
  });

  test('follows a changed message', async () => {
    const { rerender } = await render(<InlineError testID="e" message="First." />);
    await rerender(<InlineError testID="e" message="Second." />);
    expect(screen.getByTestId('e')).toHaveTextContent('Second.');
    await rerender(<InlineError testID="e" message={null} />);
    expect(screen.queryByTestId('e')).toBeNull();
  });
});
