/**
 * F5 `TripHeaderBack` / `TripHeaderTools` (UI-SPEC section 6; trip.png, trip-collapsed.png): the
 * navigator's header over the picture draws Back, Share and More as 44 dp glass discs; once the
 * solid bar is complete the same three lose their disc. The screen reports the switch through
 * `useReportCollapsed`; without a provider the controls stay glass.
 */
import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import {
  TripHeaderBack,
  TripHeaderProvider,
  TripHeaderTools,
  useReportCollapsed,
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

function header(progress: number | null) {
  return (
    <TripHeaderProvider>
      {progress === null ? null : <Reporter value={progress} />}
      <TripHeaderBack />
      <TripHeaderTools />
    </TripHeaderProvider>
  );
}

describe('the trip header controls', () => {
  test('draw Back, Share and More as 44 dp glass discs over the picture', async () => {
    await render(header(0));
    for (const label of ['Back', 'Share', 'More']) {
      const style = StyleSheet.flatten(
        screen.getByLabelText(label).props.style,
      ) as Record<string, unknown>;
      expect(style).toMatchObject({ width: 44, height: 44 });
      expect(style.backgroundColor).toBeDefined();
    }
  });

  test('Share and More are the coming-soon controls of the picture, 8 dp apart', async () => {
    await render(header(0));
    expect(screen.getByTestId('coming-soon-trip-share').props.accessibilityHint).toBe(
      'Not available yet',
    );
    expect(screen.getByTestId('coming-soon-trip-more')).toBeTruthy();
    expect(flat('trip-header-tools')).toMatchObject({ flexDirection: 'row', gap: 8 });
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
    for (const label of ['Back', 'Share', 'More']) {
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
    expect(screen.getByLabelText('Share')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });
});
