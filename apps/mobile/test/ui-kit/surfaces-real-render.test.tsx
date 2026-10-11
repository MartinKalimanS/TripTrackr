/**
 * T418 / T419 - the `Card`, `Panel`, `ListGroup` and `ListRow` ADAPTERS over the REAL
 * `heroui-native` under Jest (research D4-13).
 *
 * Every other suite renders the adapters over the stand-in in
 * `test/mocks/heroui-native.tsx`. This one puts the kit's own Card, ListGroup, Item,
 * ItemPrefix, ItemContent, ItemSuffix and Separator underneath them, so what the adapters
 * rely on is checked against the real components: the host props the kit forwards, the
 * classes it merges ours into, and that nothing needs more than the provider above it.
 * (How a class LOOKS is Uniwind's, on a device; Jest ignores `className`.)
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';
import { Text } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { Card, Panel } from '@/components/ui/card';
import { ListGroup, ListRow } from '@/components/ui/list-group';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
// The suite-wide stand-in is replaced by the real kit for THIS file only.
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));
jest.mock('@/hooks/use-appearance');
jest.mock('expo-symbols', () => {
  const { View } = require('react-native');
  return {
    SymbolView: (props: Record<string, unknown>) => <View testID="symbol" {...props} />,
  };
});

const { HeroUINativeProvider } = jest.requireActual<typeof HeroUI>('heroui-native');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

const CONFIG = { devInfo: { stylingPrinciples: false } };
const hidden = { includeHiddenElements: true };
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);

function renderKit(ui: React.ReactElement) {
  return render(<HeroUINativeProvider config={CONFIG}>{ui}</HeroUINativeProvider>);
}

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
  } as AppearanceContext);
});

describe('Card over the real kit', () => {
  test('a pressable card is one button; its surface carries our classes after the kit’s', async () => {
    const onPress = jest.fn();
    await renderKit(
      <Card
        testID="trip-card"
        accessibilityLabel="Lisbon, planning, 3 stops"
        onPress={onPress}
        overMap
        pending>
        <Text>Lisbon</Text>
      </Card>,
    );

    const control = screen.getByTestId('trip-card');
    expect(control.props.accessibilityRole).toBe('button');
    expect(control.props.accessibilityLabel).toBe('Lisbon, planning, 3 stops');
    expect(screen.getAllByRole('button')).toHaveLength(1);

    const surface = tokens(screen.getByTestId('trip-card-surface').props.className);
    expect(surface).toEqual(
      expect.arrayContaining([
        'surface__root',
        'bg-surface',
        'shadow-none',
        'border',
        'border-dashed',
        'border-pending',
      ]),
    );
    expect(surface.indexOf('bg-surface')).toBeGreaterThan(
      surface.indexOf('surface__root'),
    );
    expect(screen.getByTestId('symbol', hidden).props.name).toEqual({
      ios: 'chevron.forward',
      android: 'chevron_right',
    });

    await fireEvent.press(control);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('a plain card keeps testID and a notice role on the kit surface', async () => {
    await renderKit(
      <Card
        testID="notice"
        overMap
        accessibilityRole="alert"
        accessibilityLabel="Offline">
        <Text>Offline</Text>
      </Card>,
    );
    const node = screen.getByTestId('notice');
    expect(node.props.accessibilityRole).toBe('alert');
    expect(node.props.accessibilityLabel).toBe('Offline');
    expect(tokens(node.props.className)).toEqual(
      expect.arrayContaining(['surface__root', 'bg-surface', 'border-border']),
    );
  });

  test('a panel inside a card renders: it is not a second surface', async () => {
    await renderKit(
      <Card testID="card">
        <Panel title="Spending" testID="panel">
          <Text>Total</Text>
        </Panel>
      </Card>,
    );
    expect(screen.getByText('Spending')).toBeTruthy();
    expect(screen.getByTestId('panel')).toBeTruthy();
  });
});

describe('ListGroup and ListRow over the real kit', () => {
  test('rows, separators and the default chevron render inside the group', async () => {
    await renderKit(
      <ListGroup header="Trip" testID="group">
        <ListRow title="Notes" description="4 notes" onPress={jest.fn()} testID="notes" />
        <ListRow title="Spending" onPress={jest.fn()} testID="spending" />
        <ListRow title="Version" trailing={<Text>1.0.0</Text>} testID="version" />
      </ListGroup>,
    );

    expect(screen.getByText('Trip')).toBeTruthy();
    expect(screen.getAllByTestId(/^group-separator-/)).toHaveLength(2);
    expect(tokens(screen.getByTestId('group-separator-1').props.className)).toEqual(
      expect.arrayContaining(['separator__root', 'ms-4']),
    );
    expect(screen.getAllByTestId('symbol', hidden)).toHaveLength(2);
    expect(screen.getByText('1.0.0')).toBeTruthy();
  });

  test('the kit Item forwards role, state, actions and the press to the host row', async () => {
    const onPress = jest.fn();
    const onAccessibilityAction = jest.fn();
    await renderKit(
      <ListGroup>
        <ListRow
          title="Lisbon"
          testID="stop-row"
          onPress={onPress}
          accessibilityLabel="Stop 1: Lisbon"
          accessibilityActions={[{ name: 'delete', label: 'Remove stop' }]}
          onAccessibilityAction={onAccessibilityAction}
        />
        <ListRow title="Off" testID="off" onPress={onPress} disabled />
        <ListRow title="Static" testID="static" />
      </ListGroup>,
    );

    const row = screen.getByTestId('stop-row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Stop 1: Lisbon');
    expect(row.props.accessibilityActions).toEqual([
      { name: 'delete', label: 'Remove stop' },
    ]);
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
    await fireEvent(row, 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });
    expect(onAccessibilityAction).toHaveBeenCalledTimes(1);

    const off = screen.getByTestId('off');
    expect(off.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(off);
    expect(onPress).toHaveBeenCalledTimes(1);

    const plain = screen.getByTestId('static');
    expect(plain.props.accessible).toBe(false);
    expect(plain.props.accessibilityRole).toBeUndefined();
    expect(plain.props.accessibilityState?.disabled).not.toBe(true);
  });
});
