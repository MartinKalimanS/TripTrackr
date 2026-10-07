/**
 * T404 / T403 — the REAL `heroui-native` under Jest, once (research D4-13).
 *
 * Every other suite sees the stand-in in `test/mocks/heroui-native.tsx`. This one
 * bypasses it with `jest.requireActual` and renders the kit's own `Button`,
 * `TextField` + `Label` + `Input` + `FieldError`, `Card`, `ListGroup` and `Chip`,
 * so the stand-in's assumptions are checked against the real thing: which props
 * reach the host node, and which are replaced rather than merged.
 *
 * It is also the only place the React Compiler's handling of the kit can be seen
 * from Jest: `babel-preset-expo` compiles first-party files only, so what this
 * proves is that OUR components compile and render; the kit's own files are
 * compiled (or not) by Metro and are covered by the `expo export` runs in T402.
 *
 * Reanimated and worklets need their full mocks here: the global ones in
 * `jest.setup.ts` cover only what the app itself uses (FadeIn, Easing).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));

const HeroUINativeKit = jest.requireActual<typeof HeroUI>('heroui-native');
const {
  Button,
  Card,
  Chip,
  FieldError,
  HeroUINativeProvider,
  Input,
  Label,
  ListGroup,
  TextField,
} = HeroUINativeKit;

// The kit prints a styling banner on mount in development; the app switches it off too.
const CONFIG = { devInfo: { stylingPrinciples: false } };

function renderKit(ui: React.ReactElement) {
  return render(<HeroUINativeProvider config={CONFIG}>{ui}</HeroUINativeProvider>);
}

describe('real heroui-native under Jest (T404)', () => {
  test('Button: identity, label, role and press reach the host pressable', async () => {
    const onPress = jest.fn();
    await renderKit(
      <Button
        testID="save-button"
        accessibilityLabel="Save trip"
        accessibilityHint="Saves the trip to this device"
        onPress={onPress}>
        Save
      </Button>,
    );

    const host = screen.getByTestId('save-button');
    expect(host.props.accessibilityLabel).toBe('Save trip');
    expect(host.props.accessibilityHint).toBe('Saves the trip to this device');
    expect(host.props.accessibilityRole).toBe('button');
    expect(screen.getByText('Save')).toBeTruthy();

    await fireEvent.press(host);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('Button: isDisabled blocks the press and is announced as disabled', async () => {
    const onPress = jest.fn();
    await renderKit(
      <Button testID="save-button" isDisabled onPress={onPress}>
        Save
      </Button>,
    );

    const host = screen.getByTestId('save-button');
    expect(host.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(host);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('Button: busy and disabled are both announced when an adapter passes busy', async () => {
    // The kit spreads the caller's `accessibilityState` over its own
    // `{ disabled }`, but it also hands `disabled` to React Native's Pressable,
    // which folds it back into the state. So `busy` does not cost the "disabled"
    // announcement, whichever way an adapter spells it.
    await renderKit(
      <Button testID="save-button" isDisabled accessibilityState={{ busy: true }}>
        Save
      </Button>,
    );

    const state = screen.getByTestId('save-button').props.accessibilityState;
    expect(state).toMatchObject({ busy: true, disabled: true });
  });

  test('Chip: an interactive chip carries testID, label and state on its pressable', async () => {
    const onPress = jest.fn();
    await renderKit(
      <Chip
        testID="status-chip"
        accessibilityRole="button"
        accessibilityLabel="Status: Planning"
        accessibilityState={{ selected: true }}
        onPress={onPress}>
        Planning
      </Chip>,
    );

    const host = screen.getByTestId('status-chip');
    expect(host.props.accessibilityLabel).toBe('Status: Planning');
    expect(host.props.accessibilityRole).toBe('button');
    expect(host.props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(host);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('Chip: sets no accessibilityRole of its own', async () => {
    await renderKit(<Chip testID="status-chip">Planning</Chip>);
    expect(screen.getByTestId('status-chip').props.accessibilityRole).toBeUndefined();
  });

  test('Card: testID and label reach the host view and the parts render', async () => {
    await renderKit(
      <Card testID="trip-card" accessibilityLabel="Lisbon, 3 stops">
        <Card.Body>
          <Card.Title>Lisbon</Card.Title>
          <Card.Description>3 stops</Card.Description>
        </Card.Body>
      </Card>,
    );

    expect(screen.getByTestId('trip-card').props.accessibilityLabel).toBe(
      'Lisbon, 3 stops',
    );
    expect(screen.getByText('Lisbon')).toBeTruthy();
    expect(screen.getByText('3 stops')).toBeTruthy();
  });

  test('Card (a Surface) throws without HeroUINativeProvider above it: the root layout must keep it', async () => {
    // The kit reads its global animation settings from the provider's context with a
    // non-strict hook and destructures the result, so a missing provider is a crash,
    // not a default. The stand-in does not enforce this; the app's root layout does.
    const reported = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        render(
          <Card>
            <Card.Title>Lisbon</Card.Title>
          </Card>,
        ),
      ).rejects.toThrow(/globalIsAllAnimationsDisabled/);
    } finally {
      reported.mockRestore();
    }
  });

  test('ListGroup.Item: testID, label, role and press reach the host; it has no role by default', async () => {
    const onPress = jest.fn();
    await renderKit(
      <ListGroup>
        <ListGroup.Item
          testID="row-sign-out"
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={onPress}>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle>Sign out</ListGroup.ItemTitle>
            <ListGroup.ItemDescription>Ends this session</ListGroup.ItemDescription>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix />
        </ListGroup.Item>
        <ListGroup.Item testID="row-plain">
          <ListGroup.ItemTitle>Plain</ListGroup.ItemTitle>
        </ListGroup.Item>
      </ListGroup>,
    );

    const host = screen.getByTestId('row-sign-out');
    expect(host.props.accessibilityLabel).toBe('Sign out');
    expect(host.props.accessibilityRole).toBe('button');
    await fireEvent.press(host);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('row-plain').props.accessibilityRole).toBeUndefined();
  });

  test('TextField + Label + Input + FieldError: the input is the host, the error follows the field', async () => {
    const onChangeText = jest.fn();
    const field = (isInvalid: boolean) => (
      <TextField isRequired isInvalid={isInvalid}>
        <Label>Destination</Label>
        <Input
          testID="destination-input"
          accessibilityLabel="Destination"
          value="Lis"
          onChangeText={onChangeText}
          placeholder="Where to?"
        />
        <FieldError testID="destination-error">Enter a destination</FieldError>
      </TextField>
    );
    const { rerender } = await renderKit(field(false));

    const input = screen.getByTestId('destination-input');
    expect(input.props.accessibilityLabel).toBe('Destination');
    expect(input.props.value).toBe('Lis');
    expect(input.props.placeholder).toBe('Where to?');
    expect(input.props.editable).toBe(true);
    expect(screen.queryByTestId('destination-error')).toBeNull();

    await fireEvent.changeText(input, 'Lisbon');
    expect(onChangeText).toHaveBeenCalledWith('Lisbon');

    await rerender(
      <HeroUINativeProvider config={CONFIG}>{field(true)}</HeroUINativeProvider>,
    );
    expect(screen.getByTestId('destination-error')).toBeTruthy();
    expect(screen.getByText('Enter a destination')).toBeTruthy();
  });

  test('TextField: a disabled field makes its input non-editable but sets no disabled state', async () => {
    await renderKit(
      <TextField isDisabled>
        <Input testID="destination-input" value="" onChangeText={jest.fn()} />
      </TextField>,
    );

    const input = screen.getByTestId('destination-input');
    expect(input.props.editable).toBe(false);
    expect(input.props.accessibilityState).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Parity: the shared stand-in must put the same things on the host node as the real
// kit does, for the props the adapters rely on (research D4-13). If the kit changes
// what reaches the host, this fails here instead of in a screen suite that mocks it.
// ---------------------------------------------------------------------------

const standIn = jest.requireMock<typeof HeroUI>('heroui-native');

/** What a screen reader and a test see on a host node, without `undefined` keys. */
function hostContract(testID: string) {
  const props = screen.getByTestId(testID).props;
  const state = props.accessibilityState as Record<string, unknown> | undefined;
  return {
    testID: props.testID,
    accessibilityLabel: props.accessibilityLabel,
    accessibilityHint: props.accessibilityHint,
    accessibilityRole: props.accessibilityRole,
    accessibilityState: state
      ? Object.fromEntries(
          Object.entries(state).filter(([, value]) => value !== undefined),
        )
      : undefined,
    editable: props.editable,
    value: props.value,
  };
}

const parityScenarios: Record<string, (kit: typeof HeroUI) => React.ReactElement> = {
  'a button': (kit) => (
    <kit.Button
      testID="subject"
      accessibilityLabel="Save trip"
      accessibilityHint="Saves it">
      Save
    </kit.Button>
  ),
  'a disabled button': (kit) => (
    <kit.Button testID="subject" isDisabled>
      Save
    </kit.Button>
  ),
  'a busy, disabled button': (kit) => (
    <kit.Button testID="subject" isDisabled accessibilityState={{ busy: true }}>
      Save
    </kit.Button>
  ),
  'a selected chip': (kit) => (
    <kit.Chip
      testID="subject"
      accessibilityRole="button"
      accessibilityLabel="Planning"
      accessibilityState={{ selected: true }}>
      Planning
    </kit.Chip>
  ),
  'a plain chip': (kit) => <kit.Chip testID="subject">Planning</kit.Chip>,
  'a card': (kit) => (
    <kit.Card testID="subject" accessibilityLabel="Lisbon">
      <kit.Card.Title>Lisbon</kit.Card.Title>
    </kit.Card>
  ),
  'a list row': (kit) => (
    <kit.ListGroup>
      <kit.ListGroup.Item
        testID="subject"
        accessibilityRole="button"
        accessibilityLabel="Sign out">
        <kit.ListGroup.ItemTitle>Sign out</kit.ListGroup.ItemTitle>
      </kit.ListGroup.Item>
    </kit.ListGroup>
  ),
  'an input': (kit) => (
    <kit.TextField>
      <kit.Input testID="subject" accessibilityLabel="Destination" value="Lis" />
    </kit.TextField>
  ),
  'an input in a disabled field': (kit) => (
    <kit.TextField isDisabled>
      <kit.Input testID="subject" accessibilityLabel="Destination" value="" />
    </kit.TextField>
  ),
};

describe('the shared stand-in matches the real kit on the host node (T404)', () => {
  test.each(Object.keys(parityScenarios))('%s', async (name) => {
    const scenario = parityScenarios[name];

    await renderKit(scenario(HeroUINativeKit));
    const real = hostContract('subject');
    await screen.unmount();

    await render(
      <standIn.HeroUINativeProvider>{scenario(standIn)}</standIn.HeroUINativeProvider>,
    );
    expect(hostContract('subject')).toEqual(real);
  });
});
