/**
 * T069 / T422 - FR-021, FR-025, FR-035, contract C4-8. Empty, loading and error states
 * are designed states, held to the same standard as populated screens.
 *
 * Jest renders the kit as plain host nodes that forward every prop
 * (test/mocks/heroui-native.tsx), so what is asserted is the accessibility contract on
 * the host node and the SEMANTIC classes the adapter asks for, never real styling.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { JsonElement, JsonNode } from 'test-renderer';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { EmptyState, ErrorState, LoadingState } from './state-view';
import { glyphId, glyphNamesIn, glyphsIn } from '../../../test/helpers/icons';

jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-haptics');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock;
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
  useHaptics.mockReturnValue({
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  });
});
afterEach(() => jest.restoreAllMocks());

const classesIn = (className: unknown) => String(className ?? '').split(/\s+/);
const root = () => screen.toJSON() as JsonElement;
const elementsOf = (nodes: JsonNode[] | undefined) =>
  (nodes ?? []).filter((node): node is JsonElement => typeof node !== 'string');
/** Every host node under (and including) a node, in tree order. */
const flatten = (node: JsonElement): JsonElement[] => [
  node,
  ...elementsOf(node.children).flatMap(flatten),
];
const rootClasses = () => classesIn(root().props.className);
const ALERT_ICON = 'alert';

describe('state container - flat Atlas surface (FR-006, FR-035)', () => {
  test.each([
    ['empty', () => <EmptyState title="No trips yet" />],
    ['loading', () => <LoadingState title="Loading trips" />],
    ['error', () => <ErrorState title="Could not load trips" />],
  ])('%s state is one flat, border-free surface', async (_name, view) => {
    await render(view());
    expect(rootClasses()).toEqual(
      expect.arrayContaining([
        'bg-surface',
        'rounded-2xl',
        'p-6',
        'items-center',
        'gap-2',
      ]),
    );
    expect(rootClasses().some((name) => /^border/.test(name))).toBe(false);
    expect(rootClasses().some((name) => /^shadow/.test(name))).toBe(false);
  });
});

describe('<EmptyState> - FR-035', () => {
  test('is styled and explains itself', async () => {
    await render(<EmptyState title="No trips yet" detail="Add your first stop." />);
    expect(screen.getByText('No trips yet')).toBeTruthy();
    expect(screen.getByText('Add your first stop.')).toBeTruthy();
  });

  test('the title reads in the default ink and the detail in the muted ink', async () => {
    await render(<EmptyState title="No trips yet" detail="Add your first stop." />);
    expect(classesIn(screen.getByText('No trips yet').props.className)).toContain(
      'text-foreground',
    );
    expect(classesIn(screen.getByText('Add your first stop.').props.className)).toContain(
      'text-muted',
    );
  });

  test('draws no icon and no action unless asked', async () => {
    await render(<EmptyState title="No trips yet" />);
    expect(glyphsIn()).toEqual([]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('a named next action is a secondary button that calls back', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        title="No trips yet"
        action={{ label: 'Plan a trip', onPress, testID: 'empty-plan' }}
      />,
    );

    const action = screen.getByTestId('empty-plan');
    expect(action).toBe(screen.getByLabelText('Plan a trip'));
    expect(action.props.accessibilityRole).toBe('button');
    expect(action.props.variant).toBe('secondary');
    expect(screen.getByText('Plan a trip')).toBeTruthy();

    await fireEvent.press(action);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('an action without a testID is still reachable by its name', async () => {
    await render(
      <EmptyState
        title="No trips yet"
        action={{ label: 'Plan a trip', onPress: jest.fn() }}
      />,
    );
    expect(screen.getByLabelText('Plan a trip').props.accessibilityRole).toBe('button');
  });

  test('an icon is decorative: the title already says it', async () => {
    const icon = 'map';
    await render(<EmptyState title="No trips yet" icon={icon} />);
    expect(glyphNamesIn()).toEqual([icon]);
    expect(screen.queryByTestId(glyphId(icon))).toBeNull();
  });
});

describe('<LoadingState> - announced as ONE busy region (FR-035)', () => {
  test('is a progressbar named by its title, and focusable as one element', async () => {
    await render(<LoadingState title="Loading trips" />);
    const region = screen.getByLabelText('Loading trips');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(region.props.accessible).toBe(true);
    expect(screen.getByText('Loading trips')).toBeTruthy();
  });

  test('announces a default title when none is supplied', async () => {
    await render(<LoadingState />);
    expect(screen.getByLabelText('Loading').props.accessibilityRole).toBe('progressbar');
  });

  test('shows the kit spinner, hidden from assistive technology', async () => {
    await render(<LoadingState title="Loading trips" />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    // The kit spinner is itself a progressbar: hidden, so only the region is announced.
    const spinners = flatten(root()).filter((node) => node.props.size === 'md');
    expect(spinners).toHaveLength(1);
    expect(spinners[0].props.accessibilityElementsHidden).toBe(true);
    expect(spinners[0].props.importantForAccessibility).toBe('no-hide-descendants');
  });
});

describe('<ErrorState> - words, an icon and a way out (FR-025, FR-035)', () => {
  test('says what failed in the danger ink, with the detail below', async () => {
    await render(
      <ErrorState title="Could not load trips" detail="Check your connection." />,
    );
    expect(classesIn(screen.getByText('Could not load trips').props.className)).toContain(
      'text-danger',
    );
    expect(screen.getByText('Check your connection.')).toBeTruthy();
  });

  test('is not colour alone: a leading alert icon accompanies the title', async () => {
    await render(<ErrorState title="Could not load trips" />);
    expect(glyphNamesIn()).toEqual([ALERT_ICON]);
    // Decorative: the words carry the meaning, so assistive technology skips the glyph.
    expect(screen.queryByTestId(glyphId(ALERT_ICON))).toBeNull();

    // Leading: the glyph is the first child, ahead of the title.
    const [first, second] = elementsOf(root().children);
    expect(first.props.accessibilityElementsHidden).toBe(true);
    expect(second.children).toContain('Could not load trips');
  });

  test('offers retry as a secondary button named "Try again"', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState title="Could not load trips" onRetry={onRetry} />);

    const retry = screen.getByLabelText('Try again');
    expect(retry.props.accessibilityRole).toBe('button');
    expect(retry.props.variant).toBe('secondary');
    expect(screen.getByText('Try again')).toBeTruthy();

    await fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('omits the retry control when no retry is possible', async () => {
    await render(<ErrorState title="Could not load trips" />);
    expect(screen.queryByLabelText('Try again')).toBeNull();
  });
});

describe('what the first-sync, local-store and sign-out gates need (004 T449)', () => {
  test('a loading state can carry a detail: still ONE region named by its title, the detail its value text', async () => {
    await render(
      <LoadingState title="Syncing your trips" detail="This clears itself." />,
    );
    expect(screen.getByText('This clears itself.')).toBeTruthy();
    const region = screen.getByLabelText('Syncing your trips');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(region.props.accessible).toBe(true);
    expect(region.props.accessibilityValue).toMatchObject({
      text: 'This clears itself.',
    });
  });

  test('without a detail the region is named by its title alone and has no value text', async () => {
    await render(<LoadingState title="Loading trips" />);
    expect(
      screen.getByLabelText('Loading trips').props.accessibilityValue?.text,
    ).toBeUndefined();
  });

  test('the spinner can be left out (reduced motion) and the state is still a named progressbar', async () => {
    await render(<LoadingState title="Syncing your trips" spinner={false} />);
    expect(flatten(root()).filter((node) => node.props.size === 'md')).toHaveLength(0);
    expect(screen.getByLabelText('Syncing your trips').props.accessibilityRole).toBe(
      'progressbar',
    );
    expect(screen.getByText('Syncing your trips')).toBeTruthy();
  });

  test.each([
    [
      'empty',
      () => <EmptyState title="Offline" testID="gate" accessibilityLiveRegion="polite" />,
    ],
    [
      'loading',
      () => (
        <LoadingState title="Syncing" testID="gate" accessibilityLiveRegion="polite" />
      ),
    ],
    [
      'error',
      () => <ErrorState title="Failed" testID="gate" accessibilityLiveRegion="polite" />,
    ],
  ])(
    '%s state carries a testID and a live region on its surface',
    async (_name, view) => {
      await render(view());
      expect(screen.getByTestId('gate').props.accessibilityLiveRegion).toBe('polite');
    },
  );

  test('states carry no testID and no live region unless asked', async () => {
    await render(<EmptyState title="Offline" />);
    expect(root().props.testID).toBeUndefined();
    expect(root().props.accessibilityLiveRegion).toBeUndefined();
  });

  test('an empty-state action can be busy: announced busy, presses ignored', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState title="Offline" action={{ label: 'Try again', onPress, busy: true }} />,
    );
    const action = screen.getByLabelText('Try again');
    expect(action.props.accessibilityState).toMatchObject({ busy: true });
    await fireEvent.press(action);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('an error retry can be busy: announced busy, presses ignored', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState title="Failed" onRetry={onRetry} retryBusy />);
    const retry = screen.getByLabelText('Try again');
    expect(retry.props.accessibilityState).toMatchObject({ busy: true });
    await fireEvent.press(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });

  test('an action that is not busy announces busy false and presses through', async () => {
    const onPress = jest.fn();
    await render(<EmptyState title="Offline" action={{ label: 'Try again', onPress }} />);
    expect(screen.getByLabelText('Try again').props.accessibilityState).toMatchObject({
      busy: false,
    });
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
