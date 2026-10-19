/**
 * The mocked world of the Home suites (feature 005, T537; not a test file): the data the
 * mocked hooks answer with, the router's calls, the focus of the screen, and the `jest.mock`
 * factories that read them. A suite mocks each module with one line, for example
 *
 *   jest.mock('expo-router', () => require('../helpers/home-state').factories.router());
 *
 * and reads or sets the shared objects (`globe`, `homeTrips`, `overview`, `sync`, `router`,
 * `focus`, `sheet`) from the same module. This file imports nothing of the app, so a factory
 * that requires it can never meet it half loaded; the fixtures and render helpers that DO import
 * the screen are in `home-harness.tsx`.
 *
 * The globe itself is not mocked: the suites run the real `GlobeView` over the Mapbox stand-in of
 * `jest.setup.ts`. The sheet is a double that renders the body it is given and records its props,
 * because the sheet's own gestures are `ui/sheet.test.tsx`'s.
 */
import { createElement, type ComponentType, type ReactNode } from 'react';
import { View } from 'react-native';

export const WIDTH = 390;
export const HEIGHT = 844;
export const INSETS = { top: 54, bottom: 34, left: 0, right: 0 };
export const TAB_ZONE = 88;
/** Where the header zone ends once it has been laid out. */
export const HEADER = 150;

export const router = { push: jest.fn(), navigate: jest.fn() };
export const focus = { focused: true, appActive: true };

export const globe: {
  data: {
    trips: unknown[];
    focus: string[];
    summary: { countriesVisited: number; distanceKm: number };
  };
  loading: boolean;
  error: Error | null;
} = {
  data: { trips: [], focus: [], summary: { countriesVisited: 0, distanceKm: 0 } },
  loading: false,
  error: null,
};

export const homeTrips: {
  data: { now: unknown; next: unknown };
  covers: Record<string, string>;
  loading: boolean;
  error: Error | null;
} = { data: { now: null, next: null }, covers: {}, loading: false, error: null };

export const overview: {
  data: { summaries: unknown[]; groups: unknown[]; totals: Record<string, number> };
  loading: boolean;
  error: Error | null;
} = { data: { summaries: [], groups: [], totals: {} }, loading: false, error: null };

export const sync: { current: { kind: string; count?: number } } = {
  current: { kind: 'synced' },
};

/** The props the sheet double was last rendered with. */
export const sheet: { props: Record<string, unknown> | null } = { props: null };

type Host = ComponentType<Record<string, unknown>>;

export const factories = {
  router: () => ({
    useRouter: () => ({ push: router.push, navigate: router.navigate, back: jest.fn() }),
    useIsFocused: () => focus.focused,
    useFocusEffect: () => undefined,
  }),
  appActive: () => ({ useAppActive: () => focus.appActive }),
  mapboxReady: () => ({ useMapboxReady: () => 'ready' }),
  tabZone: () => ({ useTabZone: () => TAB_ZONE }),
  sentry: () => ({ Sentry: { captureException: jest.fn() }, initSentry: jest.fn() }),
  image: () => ({
    Image: (props: Record<string, unknown>) => createElement(View as Host, props),
  }),
  useGlobe: () => ({ useGlobe: () => globe }),
  useHomeTrips: () => ({ useHomeTrips: () => homeTrips }),
  useCountryOverview: () => ({ useCountryOverview: () => overview }),
  syncChipState: () => ({ useSyncChipState: () => sync.current }),
  syncEngine: () => ({ syncNow: jest.fn() }),
  /** The real module, but for a `Sheet` that renders its body and records its props. */
  sheet: () => {
    const actual = jest.requireActual('@/components/ui/sheet');
    const Sheet = (
      props: {
        detent: string;
        renderBody: (...args: unknown[]) => ReactNode;
      } & Record<string, unknown>,
    ) => {
      sheet.props = props;
      return createElement(
        View,
        { testID: 'home-sheet' },
        props.renderBody({ detent: props.detent, settled: props.detent }),
      );
    };
    return { ...actual, Sheet };
  },
};
