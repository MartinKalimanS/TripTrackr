/**
 * T069 / T422 / T522 - FR-021, FR-025, FR-035, FR-064, contracts C4-8 and C5-28. Empty,
 * loading and error states are designed states, held to the same standard as populated
 * screens.
 *
 * Jest renders the kit as plain host nodes that forward every prop
 * (test/mocks/heroui-native.tsx), so what is asserted is the accessibility contract on
 * the host node and the SEMANTIC classes the adapter asks for, never real styling.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { JsonElement, JsonNode } from 'test-renderer';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { EmptyState, ErrorState, LoadingRegion, LoadingState } from './state-view';
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

const hidden = { includeHiddenElements: true };
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

describe('<EmptyState> text roles - C5-28', () => {
  test('the title is a centred callout and the detail a centred muted body', async () => {
    await render(<EmptyState title="No trips yet" detail="Plan one." />);
    expect(classesIn(screen.getByText('No trips yet').props.className)).toEqual(
      expect.arrayContaining(['text-[17px]', 'font-display', 'text-center']),
    );
    expect(classesIn(screen.getByText('Plan one.').props.className)).toEqual(
      expect.arrayContaining(['text-[16px]', 'font-body', 'text-muted', 'text-center']),
    );
  });
});

describe('<EmptyState variant> - the art above the words (C5-28)', () => {
  const art = () => screen.getByTestId('empty-art', hidden);

  test('plain is the default: no art, and an icon only when asked', async () => {
    await render(<EmptyState title="Nothing" testID="empty" />);
    expect(screen.queryByTestId('empty-art', hidden)).toBeNull();
    expect(glyphsIn()).toEqual([]);
  });

  test('ghost-stamp is a dashed 96 dp circle, decorative', async () => {
    await render(
      <EmptyState variant="ghost-stamp" title="No stops yet" testID="empty" />,
    );
    expect(classesIn(art().props.className)).toEqual(
      expect.arrayContaining([
        'size-24',
        'rounded-full',
        'border-2',
        'border-dashed',
        'border-field-border',
      ]),
    );
    expect(art().props.accessibilityElementsHidden).toBe(true);
    expect(art().props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByTestId('empty-art')).toBeNull();
  });

  test('frames is three tilted empty photo frames with a photo glyph each, the middle one raised', async () => {
    await render(<EmptyState variant="frames" title="No photos yet" testID="empty" />);
    const frames = [0, 1, 2].map((index) =>
      screen.getByTestId(`empty-art-frame-${index}`, hidden),
    );
    for (const frame of frames) {
      expect(classesIn(frame.props.className)).toEqual(
        expect.arrayContaining([
          'absolute',
          // Cream, as home-empty.png's frames stand in for photographs (F2 sheet shell).
          'bg-surface-secondary',
          'border-surface',
          'rounded-2xl',
        ]),
      );
    }
    const style = (node: (typeof frames)[number]) => StyleSheet.flatten(node.props.style);
    expect(style(frames[0]).transform).toEqual([{ rotate: '-9deg' }]);
    expect(style(frames[1]).transform).toBeUndefined();
    expect(style(frames[1]).top).toBeLessThan(style(frames[0]).top as number);
    expect(style(frames[2]).transform).toEqual([{ rotate: '8deg' }]);
    for (const frame of frames) expect(style(frame).boxShadow).toBeDefined();
    expect(glyphNamesIn()).toEqual(['image', 'image', 'image']);
    expect(art().props.accessibilityElementsHidden).toBe(true);
  });

  test('filtered is a magnifier in a cream roundel', async () => {
    await render(<EmptyState variant="filtered" title="No results" testID="empty" />);
    expect(classesIn(art().props.className)).toEqual(
      expect.arrayContaining(['size-16', 'rounded-full', 'bg-surface-secondary']),
    );
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: 'search', size: 24, weight: 'regular' }),
    ]);
  });

  test('the art comes before the words', async () => {
    await render(
      <EmptyState variant="ghost-stamp" title="No stops yet" testID="empty" />,
    );
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('empty-art')).toBeLessThan(tree.indexOf('No stops yet'));
  });

  test('a variant keeps the title, the detail and the secondary action', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        variant="filtered"
        title="No results for lisb0n"
        detail="Check the spelling."
        action={{ label: 'Clear search', onPress, testID: 'clear' }}
        testID="empty"
      />,
    );
    expect(screen.getByLabelText('Clear search').props.variant).toBe('secondary');
    await fireEvent.press(screen.getByTestId('clear'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('the action is secondary unless the screen has no primary and says so', async () => {
    await render(
      <EmptyState
        title="No photos yet"
        action={{ label: 'Add photos', onPress: jest.fn(), primary: true }}
      />,
    );
    expect(screen.getByLabelText('Add photos').props.variant).toBe('primary');
  });
});

describe('<ErrorState> text roles - C5-28', () => {
  test('the title is a centred danger callout and the detail a muted body', async () => {
    await render(<ErrorState title="Could not load" detail="Try again." />);
    expect(classesIn(screen.getByText('Could not load').props.className)).toEqual(
      expect.arrayContaining(['text-[17px]', 'text-danger', 'text-center']),
    );
    expect(classesIn(screen.getByText('Try again.').props.className)).toEqual(
      expect.arrayContaining(['text-[16px]', 'text-muted']),
    );
  });
});

describe('<LoadingRegion> - the one region of every skeleton', () => {
  test('takes layout classes for the region and for the hidden wrapper', async () => {
    await render(
      <LoadingRegion testID="region" className="flex-1" gap="gap-4">
        <></>
      </LoadingRegion>,
    );
    const region = screen.getByTestId('region');
    expect(classesIn(region.props.className)).toContain('flex-1');
    expect(region.props.accessibilityRole).toBe('progressbar');
    const wrapper = region.children[0] as unknown as { props: Record<string, unknown> };
    expect(classesIn(wrapper.props.className)).toContain('gap-4');
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
