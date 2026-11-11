/**
 * F5 `TripHeaderBack` / `TripHeaderTools` (UI-SPEC section 6; trip.png, trip-collapsed.png; spec
 * 015 FR-001, FR-009): the navigator's header over the picture draws Back and More as 44 dp glass
 * discs; once the solid bar is complete the same two lose their disc. The screen reports the
 * switch through `useReportCollapsed`; without a provider the controls stay glass. More asks for
 * the trip's options; no control only says that something is missing.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import {
  TripHeaderBack,
  TripHeaderProvider,
  TripHeaderTools,
  useReportCollapsed,
  useTripOptionsState,
} from '@/components/trip/trip-header-controls';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
}));
jest.mock('react-native-worklets', () => require('../mocks/worklets'));
// The reaction runs at once, on the JS thread, so the test can say what the bar's progress is.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('../mocks/reanimated-full'),
  useAnimatedReaction: (
    prepare: () => boolean,
    react: (now: boolean, before: boolean | null) => void,
  ) => {
    const { useEffect: mockUseEffect } = jest.requireActual('react');
    mockUseEffect(() => react(prepare(), null), [prepare, react]);
  },
}));

const flat = (id: string) =>
  StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<string, unknown>;

function Reporter({ value }: { value: number }) {
  const progress = { value } as never;
  useReportCollapsed(progress);
  return null;
}

function OptionsProbe() {
  const { Text: MockText } = jest.requireActual('react-native');
  const options = useTripOptionsState();
  return (
    <MockText testID="options-probe" onPress={options.close}>
      {options.open ? 'open' : 'closed'}
    </MockText>
  );
}

function header(progress: number | null) {
  return (
    <TripHeaderProvider>
      {progress === null ? null : <Reporter value={progress} />}
      <OptionsProbe />
      <TripHeaderBack />
      <TripHeaderTools />
    </TripHeaderProvider>
  );
}

describe('the trip header controls', () => {
  test('draw Back and More as 44 dp glass discs over the picture', async () => {
    await render(header(0));
    for (const label of ['Back', 'More']) {
      const style = StyleSheet.flatten(
        screen.getByLabelText(label).props.style,
      ) as Record<string, unknown>;
      expect(style).toMatchObject({ width: 44, height: 44 });
      expect(style.backgroundColor).toBeDefined();
    }
  });

  test('More asks for the trip options and nothing says "coming soon"', async () => {
    await render(header(0));
    expect(screen.queryByLabelText('Share')).toBeNull();
    expect(screen.queryByTestId('coming-soon-trip-more')).toBeNull();
    expect(flat('trip-header-tools')).toMatchObject({ flexDirection: 'row' });
    expect(screen.getByTestId('options-probe').props.children).toBe('closed');

    await fireEvent.press(screen.getByTestId('trip-more'));
    expect(screen.getByTestId('options-probe').props.children).toBe('open');

    await fireEvent.press(screen.getByTestId('options-probe'));
    expect(screen.getByTestId('options-probe').props.children).toBe('closed');
  });

  test('lose their disc once the bar is complete, and get it back when it is not', async () => {
    const view = await render(header(0));
    const disc = (label: string) =>
      StyleSheet.flatten(screen.getByLabelText(label).props.style) as Record<
        string,
        unknown
      >;
    const glass = disc('Back').backgroundColor;
    await act(async () => view.rerender(header(1)));
    for (const label of ['Back', 'More']) {
      expect(disc(label).backgroundColor).not.toBe(glass);
    }
    expect(screen.getAllByLabelText('Back')).toHaveLength(1);
    await act(async () => view.rerender(header(0.4)));
    expect(disc('Back').backgroundColor).toBe(glass);
  });

  test('stay glass with no provider above them (the screen on its own)', async () => {
    await render(
      <>
        <TripHeaderBack />
        <TripHeaderTools />
      </>,
    );
    expect(screen.getByLabelText('More')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });
});
