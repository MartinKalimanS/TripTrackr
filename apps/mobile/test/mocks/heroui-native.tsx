/**
 * The one shared stand-in for `heroui-native` under Jest (feature 004, research D4-13).
 *
 * `jest.setup.ts` installs it for every suite with
 * `jest.mock('heroui-native', () => require('./test/mocks/heroui-native'))`, so a
 * suite that renders one of OUR adapters (`components/ui/*`) gets plain React
 * Native views, pressables, texts and inputs instead of the kit's Reanimated and
 * Uniwind internals. Tests therefore assert on the adapters' contract (labels,
 * roles, states, preserved test identifiers), never on the kit's markup. That the
 * real components honour the same contract is proved once, by
 * `test/ui-kit/real-render.test.tsx`, and on a device by Maestro.
 *
 * What a stand-in does, and does not do:
 * - It renders `children` and forwards EVERY prop to the host node: `testID`,
 *   `accessibilityLabel`, `accessibilityRole`, `accessibilityState`, `onPress`,
 *   `className`, and the kit's own (`variant`, `size`, `isInvalid`, ...), so an
 *   adapter test can read what the adapter asked of the kit.
 * - `isDisabled` also sets the host's `disabled`, as the kit's Button does.
 * - Defaults mirror the kit where it sets one: Button is role `button` and always
 *   passes `disabled`; Alert is role `alert`; Switch is role `switch`. A prop the
 *   caller passes replaces the default. `test/ui-kit/real-render.test.tsx` compares
 *   the host props of the stand-in with the real kit's for Button, Chip, Card,
 *   ListGroup.Item and Input, so the two cannot drift unnoticed.
 * - It does NOT animate, theme, measure, portal or lay anything out. Select's
 *   content mounts only while open, because that is the behaviour a test needs.
 *
 * A name missing here is `undefined` and fails loudly with React's "Element type
 * is invalid": add the export (and its parts) rather than loosening the stand-in.
 */
import {
  Fragment,
  createContext,
  createElement,
  forwardRef,
  useContext,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from 'react-native';

type StandInProps = Record<string, unknown>;
/** React Native's host components, typed loosely: the stand-ins forward arbitrary props. */
type LooseHost = ComponentType<Record<string, unknown>>;
const loose = (component: unknown) => component as LooseHost;
const LooseText = loose(Text);
const LooseTextInput = loose(TextInput);
const LoosePressable = loose(Pressable);
const childrenOf = (props: StandInProps) => props.children as ReactNode;
type StandInOptions = {
  /** Props the kit sets by default; the caller's props replace them. */
  defaults?: Record<string, unknown>;
  /** Wrap a string child in `Text`, as the kit renders it as a label. */
  labelChildren?: boolean;
  /** Always pass `disabled`, as the kit's Button does (React Native folds it into the state). */
  announceDisabled?: boolean;
};

function asLabel(children: ReactNode): ReactNode {
  return typeof children === 'string' || typeof children === 'number'
    ? createElement(Text, null, children)
    : children;
}

function standIn(Host: unknown, displayName: string, options: StandInOptions = {}) {
  const Component = forwardRef<unknown, StandInProps>(function StandIn(props, ref) {
    const { children: _children, ...rest } = props;
    const children = childrenOf(props);
    const hostProps: Record<string, unknown> = { ...options.defaults, ...rest, ref };
    if (rest.isDisabled !== undefined) hostProps.disabled = rest.isDisabled;
    if (options.announceDisabled) hostProps.disabled = Boolean(rest.isDisabled);
    return createElement(
      loose(Host),
      hostProps,
      options.labelChildren ? asLabel(children) : children,
    );
  });
  Component.displayName = displayName;
  return Component;
}

const view = (name: string, defaults?: Record<string, unknown>) =>
  standIn(View, name, { defaults });
const text = (name: string) => standIn(Text, name);
const pressable = (name: string, options?: StandInOptions) =>
  standIn(Pressable, name, { labelChildren: true, ...options });

/** Placeholder for the kit's theme colours; `useCSSVariable` in jest.setup.ts agrees. */
const MOCK_THEME_COLOR = '#808080';

// ---------------------------------------------------------------- provider, theme
/** A `jest.fn` so a suite can assert it is mounted and with which `config`. */
export const HeroUINativeProvider = jest.fn(
  ({ children }: { children?: ReactNode; config?: unknown }) =>
    createElement(Fragment, null, children),
);

export function useThemeColor(token: string | string[]) {
  return Array.isArray(token) ? token.map(() => MOCK_THEME_COLOR) : MOCK_THEME_COLOR;
}

// ---------------------------------------------------------------- actions
export const Button = Object.assign(
  pressable('Button', {
    announceDisabled: true,
    defaults: { accessibilityRole: 'button' },
  }),
  { Label: text('Button.Label') },
);

export const PressableFeedback = Object.assign(pressable('PressableFeedback'), {
  Scale: view('PressableFeedback.Scale'),
  Highlight: view('PressableFeedback.Highlight'),
  Ripple: view('PressableFeedback.Ripple'),
});

export const Chip = Object.assign(pressable('Chip'), { Label: text('Chip.Label') });

// ---------------------------------------------------------------- containers
export const Surface = view('Surface');
export const Separator = view('Separator');

export const Card = Object.assign(view('Card'), {
  Header: view('Card.Header'),
  Body: view('Card.Body'),
  Footer: view('Card.Footer'),
  Title: text('Card.Title'),
  Description: text('Card.Description'),
});

export const ListGroup = Object.assign(view('ListGroup'), {
  Item: pressable('ListGroup.Item'),
  ItemPrefix: view('ListGroup.ItemPrefix'),
  ItemContent: view('ListGroup.ItemContent'),
  ItemTitle: text('ListGroup.ItemTitle'),
  ItemDescription: text('ListGroup.ItemDescription'),
  ItemSuffix: view('ListGroup.ItemSuffix'),
});

export const Typography = text('Typography');
/** The kit still exports the deprecated alias `Text`. */
export { Typography as Text };

// ---------------------------------------------------------------- fields
const FieldContext = createContext<{ isInvalid?: boolean; isDisabled?: boolean }>({});

const TextFieldRoot = forwardRef<unknown, StandInProps>(function TextField(props, ref) {
  const { children, isInvalid, isDisabled, ...rest } = props;
  return createElement(
    FieldContext.Provider,
    { value: { isInvalid: Boolean(isInvalid), isDisabled: Boolean(isDisabled) } },
    createElement(loose(View), { ...rest, ref }, children as ReactNode),
  );
});
TextFieldRoot.displayName = 'TextField';
export const TextField = TextFieldRoot;

/** The kit's Label is a pressable root around `Label.Text`; a string child is wrapped in a Text. */
export const Label = Object.assign(standIn(View, 'Label', { labelChildren: true }), {
  Text: text('Label.Text'),
});
export const Description = text('Description');

/** Like the kit: renders only while the field (or its own `isInvalid`) is invalid. */
export const FieldError = forwardRef<unknown, StandInProps>(function FieldError(
  { children, isInvalid, ...rest },
  ref,
) {
  const field = useContext(FieldContext);
  if (!(isInvalid ?? field.isInvalid)) return null;
  return (
    <LooseText accessibilityRole="alert" {...rest} ref={ref}>
      {children as ReactNode}
    </LooseText>
  );
});

/** Like the kit: `editable` follows the field's disabled state unless overridden. */
export const Input = forwardRef<unknown, StandInProps>(function Input(props, ref) {
  const field = useContext(FieldContext);
  const { isDisabled = field.isDisabled, ...rest } = props;
  return <LooseTextInput editable={!isDisabled} {...rest} ref={ref} />;
});

export const SearchField = Object.assign(
  view('SearchField', { accessibilityRole: 'search' }),
  {
    Group: view('SearchField.Group'),
    SearchIcon: view('SearchField.SearchIcon'),
    Input: standIn(TextInput, 'SearchField.Input'),
    ClearButton: pressable('SearchField.ClearButton', {
      defaults: { accessibilityRole: 'button' },
    }),
  },
);

const SwitchRoot = forwardRef<unknown, StandInProps>(function Switch(props, ref) {
  const { children, isSelected, isDisabled, onSelectedChange, ...rest } = props;
  return createElement(
    loose(Pressable),
    {
      accessibilityRole: 'switch',
      accessibilityState: { checked: Boolean(isSelected), disabled: Boolean(isDisabled) },
      disabled: Boolean(isDisabled),
      onPress: () =>
        (onSelectedChange as ((next: boolean) => void) | undefined)?.(!isSelected),
      ...rest,
      ref,
    },
    children as ReactNode,
  );
});
SwitchRoot.displayName = 'Switch';
export const Switch = Object.assign(SwitchRoot, { Thumb: view('Switch.Thumb') });

// ---------------------------------------------------------------- select
type SelectItemValue = { value: string; label: string };
const SelectContext = createContext<{
  isOpen: boolean;
  setOpen: (next: boolean) => void;
  onValueChange?: (item: SelectItemValue) => void;
}>({ isOpen: false, setOpen: () => undefined });

function SelectRoot(props: StandInProps) {
  const { children, isOpen, onOpenChange, onValueChange, ...rest } = props;
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = typeof isOpen === 'boolean' ? isOpen : uncontrolled;
  const setOpen = (next: boolean) => {
    setUncontrolled(next);
    (onOpenChange as ((value: boolean) => void) | undefined)?.(next);
  };
  return createElement(
    SelectContext.Provider,
    { value: { isOpen: open, setOpen, onValueChange: onValueChange as never } },
    createElement(loose(View), rest, children as ReactNode),
  );
}

const SelectTrigger = forwardRef<unknown, StandInProps>(
  function SelectTrigger(props, ref) {
    const { isOpen, setOpen } = useContext(SelectContext);
    return (
      <LoosePressable
        accessibilityRole="combobox"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setOpen(!isOpen)}
        {...props}
        ref={ref}
      />
    );
  },
);

function SelectOpenOnly({ children }: { children?: ReactNode }) {
  return useContext(SelectContext).isOpen ? createElement(View, null, children) : null;
}

function SelectItem(props: StandInProps) {
  const { value, label, children, ...rest } = props;
  const { setOpen, onValueChange } = useContext(SelectContext);
  const item = { value: String(value), label: String(label ?? value) };
  return createElement(
    loose(Pressable),
    {
      accessibilityRole: 'menuitem',
      onPress: () => {
        onValueChange?.(item);
        setOpen(false);
      },
      ...rest,
    },
    asLabel(children as ReactNode),
  );
}

export const Select = Object.assign(SelectRoot, {
  Trigger: SelectTrigger,
  Value: text('Select.Value'),
  TriggerIndicator: view('Select.TriggerIndicator'),
  Portal: SelectOpenOnly,
  Overlay: view('Select.Overlay'),
  Content: view('Select.Content'),
  Item: SelectItem,
  ItemLabel: text('Select.ItemLabel'),
  ItemDescription: text('Select.ItemDescription'),
  ItemIndicator: view('Select.ItemIndicator'),
});

// ---------------------------------------------------------------- feedback
export const Alert = Object.assign(view('Alert', { accessibilityRole: 'alert' }), {
  Indicator: view('Alert.Indicator'),
  Content: view('Alert.Content'),
  Title: text('Alert.Title'),
  Description: text('Alert.Description'),
});

export const Spinner = standIn(ActivityIndicator, 'Spinner');

/** Like the kit: a placeholder while `isLoading` (default true), the children after. */
function SkeletonStandIn({ children, isLoading = true, ...rest }: StandInProps) {
  return isLoading
    ? createElement(loose(View), rest)
    : createElement(loose(View), rest, children as ReactNode);
}
export const Skeleton = SkeletonStandIn;
export const SkeletonGroup = Object.assign(view('SkeletonGroup'), {
  Item: SkeletonStandIn,
});

export const Avatar = Object.assign(view('Avatar'), {
  Image: standIn(Image, 'Avatar.Image'),
  Fallback: standIn(View, 'Avatar.Fallback', { labelChildren: true }),
});

// ---------------------------------------------------------------- toast
export const mockToast = {
  show: jest.fn((): string => 'toast-id'),
  hide: jest.fn(),
};
export const ToastProvider = ({ children }: { children?: ReactNode }) =>
  createElement(Fragment, null, children);
export const useToast = () => ({ toast: mockToast, isToastVisible: false });
export const Toast = Object.assign(view('Toast', { accessibilityRole: 'alert' }), {
  Title: text('Toast.Title'),
  Description: text('Toast.Description'),
  Action: pressable('Toast.Action', { defaults: { accessibilityRole: 'button' } }),
  Close: pressable('Toast.Close', { defaults: { accessibilityRole: 'button' } }),
});
