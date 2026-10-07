/**
 * `<FormActions>` — the Cancel / Save row that closes every form sheet (add
 * trip, add expense, the stop and note editors). The testIDs and labels are
 * what the Maestro flows and the screen suites select by, so they are pinned
 * here; so are the treatments that tell the two buttons apart.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { FormActions, type FormActionsProps } from '@/components/ui/form-actions';
import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { surfaceStyle } from '@/theme/surfaces';

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
    elevationProfile: 'full',
    tokens: Colors.light,
  } as AppearanceContext);
});

function styleOf(node: { props: Record<string, unknown> }) {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}

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

  test('Cancel rests flat and Save stands raised at depth 2, side by side at equal width', async () => {
    await renderActions();

    const cancel = styleOf(screen.getByTestId('add-expense-cancel'));
    const save = styleOf(screen.getByTestId('add-expense-save'));
    const options = {
      theme: 'light',
      profile: 'full',
      radius: 'md',
      interactive: true,
    } as const;
    expect(cancel.boxShadow).toBeUndefined();
    expect(save.boxShadow).toEqual(
      surfaceStyle('raised', { ...options, depth: 2 }).boxShadow,
    );
    expect(cancel.flex).toBe(1);
    expect(save.flex).toBe(1);
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
