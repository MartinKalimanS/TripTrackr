/**
 * T422 / T521 - FR-025, FR-030, contracts C4-8 and C5-18 (`InlineError`). A write failure
 * is said in words,
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

  test('reads in the danger ink, as a 14 / 20 label', async () => {
    await render(<InlineError testID="e" message="Could not be saved." />);
    expect(classesOf(screen.getByText('Could not be saved.'))).toEqual(
      expect.arrayContaining(['text-danger', 'text-[14px]', 'font-body-semibold']),
    );
  });

  test('sits in a danger-tint box with a 1.5 dp danger edge, 16 dp corners and room to breathe', async () => {
    await render(<InlineError testID="e" message="Could not be saved." />);
    expect(classesOf(screen.getByTestId('e'))).toEqual(
      expect.arrayContaining([
        'bg-danger-tint',
        'border-danger',
        'border-[1.5px]',
        'rounded-2xl',
        'p-3',
      ]),
    );
    expect(screen.getByTestId('e').props.style).toMatchObject({
      borderCurve: 'continuous',
    });
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
