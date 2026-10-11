/**
 * `<FormActions>` — the Cancel / Save row that closes every form sheet (add
 * trip, add expense, the stop and note editors). The testIDs and labels are
 * what the Maestro flows and the screen suites select by, so they are pinned
 * here; so is the emphasis that tells the two buttons apart (FR-005: Save is the
 * single primary, Cancel is a text button) and the row that wraps at the
 * largest text size (FR-029).
 *
 * The kit's Button is a plain Pressable under Jest that forwards every prop
 * (test/mocks/heroui-native.tsx), so the tests read what the adapter asked of it.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { FormActions, type FormActionsProps } from '@/components/ui/form-actions';
import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    tokens: Colors.light,
  } as AppearanceContext);
});

const classesOf = (node: { props: Record<string, unknown> }) =>
  String(node.props.className ?? '').split(/\s+/);

async function renderActions(overrides: Partial<FormActionsProps> = {}) {
  const props: FormActionsProps = {
    testIDPrefix: 'add-expense',
    saveLabel: 'Save expense',
    onCancel: jest.fn(),
    onSave: jest.fn(),
    ...overrides,
  };
  await render(<FormActions {...props} />);
  return props;
}

describe('<FormActions>', () => {
  test('renders Cancel and the save button under the prefixed testIDs, labelled as they read', async () => {
    await renderActions();

    const cancel = screen.getByTestId('add-expense-cancel');
    const save = screen.getByTestId('add-expense-save');
    expect(cancel.props.accessibilityLabel).toBe('Cancel');
    expect(cancel.props.accessibilityRole).toBe('button');
    expect(cancel).toHaveTextContent('Cancel');
    expect(save.props.accessibilityLabel).toBe('Save expense');
    expect(save.props.accessibilityRole).toBe('button');
    expect(save).toHaveTextContent('Save expense');
    expect(screen.getByLabelText('Cancel')).toBe(cancel);
    expect(screen.getByLabelText('Save expense')).toBe(save);
  });

  test('Cancel calls onCancel and Save calls onSave — each only its own', async () => {
    const props = await renderActions({
      testIDPrefix: 'note-editor',
      saveLabel: 'Save note',
    });

    await fireEvent.press(screen.getByTestId('note-editor-cancel'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onSave).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('note-editor-save'));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  test('Save is the single primary and Cancel a text button (FR-005)', async () => {
    await renderActions();

    const cancel = screen.getByTestId('add-expense-cancel');
    const save = screen.getByTestId('add-expense-save');
    expect(save.props.variant).toBe('primary');
    expect(cancel.props.variant).toBe('ghost');
    expect(
      screen.getAllByRole('button').filter((b) => b.props.variant === 'primary'),
    ).toHaveLength(1);
  });

  test('keeps the reading order Cancel then Save', async () => {
    await renderActions();
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Cancel', 'Save expense']);
  });

  test('the row wraps at large text, each button growing to share the line', async () => {
    await renderActions();

    const cancel = screen.getByTestId('add-expense-cancel');
    const save = screen.getByTestId('add-expense-save');
    const row = cancel.parent;
    expect(row).toBe(save.parent);
    expect(classesOf(row!)).toEqual(
      expect.arrayContaining(['flex-row', 'flex-wrap', 'gap-3']),
    );
    for (const button of [cancel, save]) {
      // grow shares the line; max-w-full lets a long label wrap inside a button that
      // already fills the row instead of overflowing it.
      expect(classesOf(button)).toEqual(expect.arrayContaining(['grow', 'max-w-full']));
    }
  });

  test('a disabled save is announced unavailable and inert, while Cancel still works', async () => {
    const props = await renderActions({
      testIDPrefix: 'stop-editor',
      saveLabel: 'Save stop',
      saveDisabled: true,
    });

    const save = screen.getByTestId('stop-editor-save');
    expect(save.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(save);
    expect(props.onSave).not.toHaveBeenCalled();

    const cancel = screen.getByTestId('stop-editor-cancel');
    expect(cancel.props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(cancel);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  test('the save button is available by default', async () => {
    await renderActions();
    expect(screen.getByTestId('add-expense-save').props.accessibilityState).toMatchObject(
      { disabled: false },
    );
  });
});
