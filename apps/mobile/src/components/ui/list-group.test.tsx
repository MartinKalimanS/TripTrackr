/**
 * T419 / T521 - contracts C4-8 and C5-18 (`ListGroup`, `ListRow`), FR-013, FR-024, FR-025,
 * FR-029, FR-030, FR-055, FR-069.
 *
 * The kit's ListGroup, its Item and its Separator are plain host nodes under Jest
 * (test/mocks/heroui-native.tsx) that carry every prop they were given, so what is
 * asserted is what the adapter ASKED of the kit (semantic classes, the corner, the
 * children) and the accessibility contract on the row's host node: role, name, state,
 * hint and actions, which the kit's Item does not set itself.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { StyleSheet, Text as NativeText } from 'react-native';

import { Colors, MinTouchTarget } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { FocusRing, Radii } from '@/theme';

import { touchDown, touchUp } from '../../../test/helpers/touch';
import { Card } from './card';
import { ListGroup, ListRow } from './list-group';
import { Icon } from './icon';
import { glyphNamesIn, glyphsIn } from '../../../test/helpers/icons';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ...overrides,
  } as AppearanceContext);
}

beforeEach(() => mockAppearance());
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const classesOf = (testID: string) => tokens(screen.getByTestId(testID).props.className);
const styleOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;

const CHEVRON = 'chevron-right';

describe('<ListGroup> - rows in one cream group, FR-013, C5-18', () => {
  test('puts its rows in order inside the kit group, in a continuous 24 dp corner', async () => {
    await render(
      <ListGroup testID="group">
        <ListRow title="Notes" testID="row-notes" />
        <ListRow title="Spending" testID="row-spending" />
      </ListGroup>,
    );
    const group = screen.getByTestId('group');
    expect(group.props.variant).toBe('secondary');
    expect(styleOf('group')).toMatchObject({
      borderRadius: Radii.xl,
      borderCurve: 'continuous',
    });
    const titles = screen
      .getAllByText(/Notes|Spending/)
      .map((node) => node.props.children);
    expect(titles).toEqual(['Notes', 'Spending']);
  });

  test('is a tile: the cream fill, a hairline and no shadow of its own', async () => {
    await render(<ListGroup testID="group" />);
    expect(classesOf('group')).toEqual(
      expect.arrayContaining([
        'bg-surface-secondary',
        'border',
        'border-separator',
        'shadow-none',
      ]),
    );
    expect(styleOf('group').boxShadow).toBeUndefined();
  });

  test('draws an inset separator BETWEEN rows, not before the first or after the last', async () => {
    await render(
      <ListGroup testID="group">
        <ListRow title="One" />
        <ListRow title="Two" />
        <ListRow title="Three" />
      </ListGroup>,
    );
    const separators = screen.getAllByTestId(/^group-separator-/);
    expect(separators).toHaveLength(2);
    for (const separator of separators) {
      expect(tokens(separator.props.className)).toContain('ms-4');
    }
  });

  test('has no separator for one row, and none for no rows', async () => {
    await render(
      <ListGroup testID="one">
        <ListRow title="Only" />
      </ListGroup>,
    );
    expect(screen.queryAllByTestId(/^one-separator-/)).toHaveLength(0);
    await render(<ListGroup testID="none" />);
    expect(screen.queryAllByTestId(/^none-separator-/)).toHaveLength(0);
  });

  test('skips what renders nothing and flattens a mapped list', async () => {
    const stops = ['Lisbon', 'Porto'];
    await render(
      <ListGroup testID="group">
        {false}
        <ListRow title="First" />
        {null}
        {stops.map((stop) => (
          <ListRow key={stop} title={stop} />
        ))}
        {undefined}
      </ListGroup>,
    );
    expect(screen.getAllByTestId(/^group-separator-/)).toHaveLength(2);
    expect(screen.getByText('Lisbon')).toBeTruthy();
  });

  test('an optional header is a muted caption above the group, announced as a heading', async () => {
    await render(
      <ListGroup header="Account" testID="group">
        <ListRow title="Email" />
      </ListGroup>,
    );
    const header = screen.getByText('Account');
    expect(header.props.accessibilityRole).toBe('header');
    expect(tokens(header.props.className)).toEqual(
      expect.arrayContaining(['text-muted', 'text-[14px]', 'font-body-semibold']),
    );
  });

  test('has no header unless one is given', async () => {
    await render(
      <ListGroup>
        <ListRow title="Email" />
      </ListGroup>,
    );
    expect(screen.queryByRole('header')).toBeNull();
  });

  test('keeps a caller layout className and style on the group', async () => {
    await render(
      <ListGroup testID="group" className="self-stretch" style={{ marginTop: 8 }} />,
    );
    expect(classesOf('group')).toContain('self-stretch');
    expect(styleOf('group')).toMatchObject({ marginTop: 8 });
  });
});

describe('a group is a raised surface: never inside a card (FR-006)', () => {
  test('a group inside a card is a development error', async () => {
    await expect(
      render(
        <Card>
          <ListGroup>
            <ListRow title="Email" />
          </ListGroup>
        </Card>,
      ),
    ).rejects.toThrow(/never contains/);
  });

  test('a card inside a group, and a group inside a group, are too', async () => {
    await expect(
      render(
        <ListGroup>
          <Card />
        </ListGroup>,
      ),
    ).rejects.toThrow(/never contains/);
    await expect(
      render(
        <ListGroup>
          <ListGroup />
        </ListGroup>,
      ),
    ).rejects.toThrow(/never contains/);
  });

  test('two groups side by side are fine', async () => {
    await render(
      <>
        <ListGroup testID="a" />
        <ListGroup testID="b" />
      </>,
    );
    expect(screen.getByTestId('a')).toBeTruthy();
    expect(screen.getByTestId('b')).toBeTruthy();
  });
});

describe('<ListRow> content - FR-029', () => {
  test('shows the title as a callout and the description as a muted label', async () => {
    await render(<ListRow title="Spending" description="3 expenses" />);
    expect(tokens(screen.getByText('Spending').props.className)).toEqual(
      expect.arrayContaining(['text-[17px]', 'font-display', 'text-foreground']),
    );
    expect(tokens(screen.getByText('3 expenses').props.className)).toEqual(
      expect.arrayContaining(['text-[14px]', 'font-body', 'text-muted']),
    );
  });

  test('is a 60 dp row: a minimum, scaled by the text size, never a height', async () => {
    await render(<ListRow title="Version" testID="row" />);
    expect(styleOf('row').minHeight).toBe(60);
    mockAppearance({ fontScale: 1.5 });
    await render(<ListRow title="Version" testID="big" />);
    expect(styleOf('big').minHeight).toBe(90);
    expect(styleOf('big').height).toBeUndefined();
  });

  test('has no description line when there is none', async () => {
    await render(<ListRow title="Spending" />);
    expect(screen.getAllByText(/./)).toHaveLength(1);
  });

  test('wraps at large text: no line limit, no fixed or maximum height', async () => {
    mockAppearance({ fontScale: 2 });
    await render(
      <ListRow
        title="A very long place name that has to wrap at the largest text size"
        description="and a description that wraps as well"
        onPress={jest.fn()}
        testID="row"
      />,
    );
    for (const text of screen.getAllByText(/wrap/)) {
      expect(text.props.numberOfLines).toBeUndefined();
    }
    const style = styleOf('row');
    expect(style.height).toBeUndefined();
    expect(style.maxHeight).toBeUndefined();
  });

  test('puts the leading node before the text', async () => {
    await render(
      <ListRow
        title="Notes"
        leading={<NativeText testID="leading">N</NativeText>}
        testID="row"
      />,
    );
    expect(screen.getByTestId('leading')).toBeTruthy();
  });

  test('shows a trailing node on a row that is not pressable, with no chevron', async () => {
    await render(
      <ListRow
        title="Status"
        trailing={<NativeText testID="trailing">Planning</NativeText>}
      />,
    );
    expect(screen.getByTestId('trailing')).toBeTruthy();
    expect(glyphsIn()).toEqual([]);
  });
});

describe('<ListRow onPress> is one control with a cue - FR-024, FR-026', () => {
  const renderRow = (props: Record<string, unknown> = {}) =>
    render(
      <ListRow
        title="Notes"
        description="4 notes"
        testID="row"
        onPress={jest.fn()}
        {...props}
      />,
    );

  test('is a button, forwards testID to the row itself and presses once', async () => {
    const onPress = jest.fn();
    await renderRow({ onPress });
    const row = screen.getByTestId('row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessible).toBe(true);
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('shows the default chevron in the muted ink when it has no trailing node', async () => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    useThemeColor.mockReturnValue('#123456' as never);
    await renderRow();
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: CHEVRON, color: '#123456' }),
    ]);
    expect(useThemeColor).toHaveBeenCalledWith('muted');
    expect(screen.getByTestId('row-cue', hidden).props.accessible).toBe(false);
  });

  test('a trailing node replaces the chevron: the row supplies its own cue', async () => {
    await renderRow({ trailing: <NativeText testID="own-cue">Open</NativeText> });
    expect(screen.getByTestId('own-cue')).toBeTruthy();
    expect(glyphsIn()).toEqual([]);
  });

  test('forwards the name, the hint and the actions, and handles an action', async () => {
    const onAccessibilityAction = jest.fn();
    const accessibilityActions = [
      { name: 'moveUp', label: 'Move up' },
      { name: 'moveDown', label: 'Move down' },
      { name: 'edit', label: 'Edit dates' },
      { name: 'delete', label: 'Remove stop' },
    ];
    await renderRow({
      accessibilityLabel: 'Stop 1: Lisbon, Portugal',
      accessibilityHint: 'Opens the stop',
      accessibilityActions,
      onAccessibilityAction,
    });
    const row = screen.getByTestId('row');
    expect(row.props.accessibilityLabel).toBe('Stop 1: Lisbon, Portugal');
    expect(row.props.accessibilityHint).toBe('Opens the stop');
    expect(row.props.accessibilityActions).toEqual(accessibilityActions);
    await fireEvent(row, 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });
    expect(onAccessibilityAction).toHaveBeenCalledTimes(1);
    expect(onAccessibilityAction.mock.calls[0][0].nativeEvent.actionName).toBe('delete');
  });

  test('sets no name of its own: the platform reads the row text, trailing text included', async () => {
    await renderRow();
    expect(screen.getByTestId('row').props.accessibilityLabel).toBeUndefined();
  });

  test('disabled is announced, ignores presses and is dimmed', async () => {
    const onPress = jest.fn();
    await renderRow({ onPress, disabled: true });
    const row = screen.getByTestId('row');
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    expect(classesOf('row')).toContain('opacity-disabled');
  });

  test('is never shorter than the platform minimum and grows with the text size', async () => {
    await renderRow();
    expect(styleOf('row').minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
    mockAppearance({ fontScale: 2 });
    await renderRow({ testID: 'big' });
    expect(styleOf('big').minHeight).toBe(120);
  });

  test('swaps to the tertiary fill while held, at once, with no transition', async () => {
    await renderRow();
    expect(classesOf('row')).toContain('active:bg-surface-tertiary');
  });

  test('while held only ink sits on the pressed fill: the description leaves the muted ink', async () => {
    jest.useFakeTimers();
    try {
      await renderRow();
      expect(tokens(screen.getByText('4 notes').props.className)).toContain('text-muted');
      await touchDown(screen.getByTestId('row'));
      const held = tokens(screen.getByText('4 notes').props.className);
      expect(held).toContain('text-foreground');
      expect(held).not.toContain('text-muted');
      expect(tokens(screen.getByText('Notes').props.className)).toContain(
        'text-foreground',
      );
      await touchUp(screen.getByTestId('row'));
      // Pressability keeps a press visible for a minimum time before it ends.
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(tokens(screen.getByText('4 notes').props.className)).toContain('text-muted');
    } finally {
      jest.useRealTimers();
    }
  });

  test('a destructive row keeps its danger title while held', async () => {
    jest.useFakeTimers();
    try {
      await renderRow({ tone: 'destructive', title: 'Delete account' });
      await touchDown(screen.getByTestId('row'));
      expect(tokens(screen.getByText('Delete account').props.className)).toContain(
        'text-danger',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('draws an inset 2 dp focus ring in the focus token while focused', async () => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    useThemeColor.mockImplementation(((token: string) =>
      token === 'focus' ? 'focus-colour' : 'other') as never);
    await renderRow();
    expect(styleOf('row').outlineWidth).toBeUndefined();
    await fireEvent(screen.getByTestId('row'), 'focus');
    expect(styleOf('row')).toMatchObject({
      outlineWidth: FocusRing.width,
      outlineOffset: -FocusRing.width,
      outlineColor: 'focus-colour',
      outlineStyle: 'solid',
    });
    await fireEvent(screen.getByTestId('row'), 'blur');
    expect(styleOf('row').outlineWidth).toBeUndefined();
  });
});

describe('<ListRow> without onPress is not a control - FR-030', () => {
  test('has no role, no press, no pressed fill and is not focusable', async () => {
    await render(<ListRow title="Version" description="1.0.0" testID="row" />);
    const row = screen.getByTestId('row');
    expect(row.props.accessibilityRole).toBeUndefined();
    expect(row.props.onPress).toBeUndefined();
    expect(row.props.focusable).toBe(false);
    expect(classesOf('row')).not.toContain('active:bg-surface-tertiary');
    expect(glyphsIn()).toEqual([]);
    expect(row.props.accessibilityState?.disabled).not.toBe(true);
  });

  test('leaves its own text and trailing controls individually reachable', async () => {
    await render(<ListRow title="Notifications" testID="row" />);
    expect(screen.getByTestId('row').props.accessible).toBe(false);
  });

  test('is one element for assistive technology when it is given a name or actions', async () => {
    await render(
      <ListRow title="Version" testID="named" accessibilityLabel="Version 1.0.0" />,
    );
    expect(screen.getByTestId('named').props.accessible).toBe(true);
    expect(screen.getByTestId('named').props.accessibilityLabel).toBe('Version 1.0.0');

    await render(
      <ListRow
        title="Stop"
        testID="actions"
        accessibilityActions={[{ name: 'delete', label: 'Remove stop' }]}
        onAccessibilityAction={jest.fn()}
      />,
    );
    expect(screen.getByTestId('actions').props.accessible).toBe(true);
  });

  test('a disabled flag without a press does not announce the row unavailable', async () => {
    await render(<ListRow title="Version" disabled testID="row" />);
    expect(screen.getByTestId('row').props.accessibilityState?.disabled).not.toBe(true);
  });
});

describe('<ListRow tone="destructive"> is not colour alone - FR-025', () => {
  test('uses the danger ink for the title and a leading icon beside it', async () => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    useThemeColor.mockReturnValue('#123456' as never);
    await render(
      <ListRow
        title="Delete account"
        tone="destructive"
        onPress={jest.fn()}
        testID="row"
      />,
    );
    expect(tokens(screen.getByText('Delete account').props.className)).toEqual(
      expect.arrayContaining(['text-danger']),
    );
    expect(tokens(screen.getByText('Delete account').props.className)).not.toContain(
      'text-foreground',
    );
    expect(screen.getByTestId('row-icon', hidden).props.accessible).toBe(false);
    expect(useThemeColor).toHaveBeenCalledWith('danger');
  });

  test('keeps the caller leading node instead of adding its own icon', async () => {
    await render(
      <ListRow
        title="Sign out"
        tone="destructive"
        testID="row"
        leading={<Icon name={'log-out'} />}
      />,
    );
    expect(glyphNamesIn()).toEqual(['log-out']);
  });

  test('the default tone uses the foreground ink and adds no icon', async () => {
    await render(<ListRow title="Notes" testID="row" />);
    expect(tokens(screen.getByText('Notes').props.className)).toContain(
      'text-foreground',
    );
    expect(glyphsIn()).toEqual([]);
  });
});

describe('<ListRow busy> - an operation is in flight (FR-019, FR-030; 004 T448)', () => {
  test('announces busy and unavailable, ignores presses and says so with a spinner', async () => {
    const onPress = jest.fn();
    await render(<ListRow title="Signing out…" testID="row" onPress={onPress} busy />);
    const row = screen.getByTestId('row');
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
    expect(row.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    // The spinner replaces the chevron, and is hidden from assistive technology.
    expect(screen.queryByTestId('row-cue', hidden)).toBeNull();
    const spinner = screen.getByTestId('row-spinner', hidden);
    expect(spinner.props.accessibilityElementsHidden).toBe(true);
    expect(spinner.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('keeps the caller trailing node out of the way of the spinner, not the other way round', async () => {
    await render(
      <ListRow
        title="Sign out"
        testID="row"
        onPress={jest.fn()}
        busy
        trailing={<NativeText testID="trailing">x</NativeText>}
      />,
    );
    expect(screen.getByTestId('row-spinner', hidden)).toBeTruthy();
    expect(screen.queryByTestId('trailing', hidden)).toBeNull();
  });

  test('is dimmed like an unavailable row only when it is also disabled, never merely for being busy', async () => {
    await render(<ListRow title="Sign out" testID="row" onPress={jest.fn()} busy />);
    expect(classesOf('row')).not.toContain('opacity-disabled');
  });

  test('a row that is not busy announces no busy state and keeps its chevron', async () => {
    await render(<ListRow title="Sign out" testID="row" onPress={jest.fn()} />);
    expect(screen.getByTestId('row').props.accessibilityState?.busy).toBeUndefined();
    expect(screen.getByTestId('row-cue', hidden)).toBeTruthy();
    expect(screen.queryByTestId('row-spinner', hidden)).toBeNull();
  });

  test('busy on a row with no press is not a control: nothing is announced busy', async () => {
    await render(<ListRow title="Version" testID="row" busy />);
    expect(screen.getByTestId('row').props.accessibilityState?.busy).toBeUndefined();
    expect(screen.queryByTestId('row-spinner', hidden)).toBeNull();
  });
});
