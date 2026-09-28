/**
 * Mobile test bootstrap.
 *
 * Native modules that have no JS fallback are stubbed here rather than in each
 * suite. A stub that lies is worse than no stub, so each one below mirrors the
 * real module's contract closely enough that a test failing against it would
 * also fail against the device.
 */
import '@testing-library/react-native';

// expo-secure-store is backed by the iOS Keychain / Android Keystore. In tests it
// becomes an in-memory map so that token-refresh logic (T039/T040) is exercisable.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    // Keychain accessibility constants are opaque numbers on the device
    // (v57 SecureStore reference, `KeychainAccessibilityConstant`).
    AFTER_FIRST_UNLOCK: 1,
    WHEN_UNLOCKED: 2,
    __reset: () => store.clear(),
  };
});

// expo-crypto's native module is auto-mocked by jest-expo into a function that
// returns `undefined` (randomUUID) or all-zero bytes (getRandomBytesAsync) —
// both would silently pass tests that a device would fail (duplicate ids, a
// zero database key). Node's CSPRNG gives the same contract with real entropy.
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('crypto') as typeof import('crypto');
  return {
    randomUUID: jest.fn(() => nodeCrypto.randomUUID()),
    getRandomBytes: jest.fn(
      (count: number) => new Uint8Array(nodeCrypto.randomBytes(count)),
    ),
    getRandomBytesAsync: jest.fn(
      async (count: number) => new Uint8Array(nodeCrypto.randomBytes(count)),
    ),
  };
});

// expo-sqlite is native. Suites that need a real database build one over
// `node:sqlite` through test/db/sqlite-harness.ts and hand it to drizzle; the
// module itself only has to exist so that `drizzle-orm/expo-sqlite` (which
// imports `addDatabaseChangeListener` for live queries) can load. The listener
// registry is real so a suite can fire a table change and watch a live query
// re-run — exactly what the device's update hook does.
// (Only global names appear in type positions here: babel-jest's out-of-scope
// guard misreads a parameter name inside a function type as a variable.)
jest.mock('expo-sqlite', () => {
  const listeners: Set<Function> = new Set();
  return {
    openDatabaseAsync: jest.fn(),
    openDatabaseSync: jest.fn(),
    addDatabaseChangeListener: jest.fn((listener: Function) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    }),
    __emitChange: (tableName: string) => {
      for (const listener of listeners) {
        listener({ databaseName: 'test', tableName, rowId: 0 });
      }
    },
    __listenerCount: () => listeners.size,
  };
});

// The native date picker renders a dialog (Android) or a UIDatePicker (iOS).
// The stub records its props so a test can drive `onValueChange` directly.
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Picker = (props: Record<string, unknown>) =>
    React.createElement(View, { testID: 'date-time-picker', ...props });
  return {
    __esModule: true,
    default: Picker,
    DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn(async () => true) },
  };
});

// Reanimated 4 drives animations through a native worklets runtime that does not
// exist under Jest — merely IMPORTING a component that uses it throws at require
// time. The library's own `mock.js` re-imports the real entry point, so it does
// not help. These stubs cover exactly what this codebase uses and no more, so
// they cannot quietly diverge from the real API in ways tests would miss.
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args),
}));

jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');

  // Entering/exiting animations are chainable builders in the real API; here
  // they are inert objects that accept the same calls.
  const builder = {
    duration: () => builder,
    delay: () => builder,
    springify: () => builder,
  };

  class Keyframe {
    duration() {
      return this;
    }
    delay() {
      return this;
    }
  }

  return {
    __esModule: true,
    default: {
      View: ReactNative.View,
      Text: ReactNative.Text,
      ScrollView: ReactNative.ScrollView,
      Image: ReactNative.Image,
    },
    FadeIn: builder,
    FadeOut: builder,
    // Easing functions are consumed as opaque values by the animation driver,
    // so returning an inert object preserves every call shape the code uses.
    Easing: new Proxy(
      {},
      {
        get: () => () => ({}),
      },
    ),
    Keyframe,
  };
});

// react-native-sortables is built on reanimated worklets and gesture-handler
// gestures, neither of which runs under Jest. The stand-in renders the items
// in data order through the real `renderItem`, wraps `Sortable.Handle` in a
// plain View, and keeps the latest `onDragEnd` so a suite can deliver a drop
// exactly as the library would: `{ data }` already in the new order (D-22).
jest.mock('react-native-sortables', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const registry: { onDragEnd: ((params: { data: unknown[] }) => void) | null } = {
    onDragEnd: null,
  };
  const Grid = ({
    data,
    renderItem,
    onDragEnd,
    keyExtractor,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
    onDragEnd?: (params: { data: unknown[] }) => void;
    keyExtractor?: (item: unknown) => string;
  }) => {
    registry.onDragEnd = onDragEnd ?? null;
    return React.createElement(
      View,
      { testID: 'sortable-grid' },
      data.map((item, index) =>
        React.createElement(
          View,
          { key: keyExtractor ? keyExtractor(item) : String(index) },
          renderItem({ item, index }),
        ),
      ),
    );
  };
  const Handle = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, { testID: 'sortable-handle' }, children);
  const Layer = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);
  return {
    __esModule: true,
    default: { Grid, Handle, Layer, Flex: Layer },
    __dropAt: (data: unknown[]) => registry.onDragEnd?.({ data }),
  };
});

// react-native-keyboard-controller reads keyboard frames natively; the library
// ships its own Jest double in which `KeyboardAwareScrollView` is a ScrollView.
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);

// FlashList measures its viewport natively. This mirrors the library's own
// `jestSetup.js` — `FlashList` becomes the un-animated `RecyclerView` and the
// layout measurements are stubbed so every item renders in the test tree
// (D-23). Inlined rather than required because the setup shipped with the
// SDK-pinned 2.0.2 reads `RecyclerView` off the package root, where that
// version does not export it; the class lives one directory down.
jest.mock('@shopify/flash-list', () => {
  const actual = jest.requireActual('@shopify/flash-list');
  const { RecyclerView } = jest.requireActual(
    '@shopify/flash-list/dist/recyclerview/RecyclerView',
  );
  return { ...actual, FlashList: RecyclerView };
});

jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => {
  const actual = jest.requireActual(
    '@shopify/flash-list/dist/recyclerview/utils/measureLayout',
  );
  const viewport = { x: 0, y: 0, width: 400, height: 900 };
  return {
    ...actual,
    measureParentSize: jest.fn(() => viewport),
    measureFirstChildLayout: jest.fn(() => viewport),
    measureItemLayout: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 100 })),
  };
});

// The device locale is what `Intl` formats money and dates in (D-27). A fixed
// en-GB locale keeps assertions on "€12.50" and "12 May 2026" stable wherever
// the suite runs; a test about another separator overrides `getLocales`.
jest.mock('expo-localization', () => {
  const locale = {
    languageTag: 'en-GB',
    languageCode: 'en',
    regionCode: 'GB',
    textDirection: 'ltr',
    decimalSeparator: '.',
    digitGroupingSeparator: ',',
    currencyCode: 'GBP',
    currencySymbol: '£',
    measurementSystem: 'metric',
    temperatureUnit: 'celsius',
  };
  return {
    getLocales: jest.fn(() => [locale]),
    useLocales: jest.fn(() => [locale]),
    getCalendars: jest.fn(() => [
      {
        calendar: 'gregory',
        timeZone: 'Europe/London',
        uses24hourClock: true,
        firstWeekday: 2,
      },
    ]),
  };
});

// Screen-capture blocking (FR-032, documents) has no meaning off-device.
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
  usePreventScreenCapture: jest.fn(),
}));

// Mapbox draws through native views; the globe suites assert on the props the
// app hands it, not on pixels. Each component becomes a View tagged
// `mapbox-<Kind>-<id>` (or the testID it was given) carrying every prop, so a
// suite can read a source's `shape` or a layer's `filter` and fire `onPress`
// with the `{ features }` payload the native side delivers. A layer's `style`
// is Mapbox style properties, not a React Native style, so it travels as
// `layerStyle`. `setAccessToken` resolves with the token, as the native module
// does (@rnmapbox/maps 10.3.5, RNMBXModule.setAccessToken).
jest.mock('@rnmapbox/maps', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  // Untyped on purpose: the stand-in forwards Mapbox props a View does not declare.
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  const standIn = (kind: string) => {
    const StandIn = ({
      children,
      style,
      testID,
      ...props
    }: {
      children?: React.ReactNode;
      style?: unknown;
      testID?: string;
      id?: string;
    }) =>
      React.createElement(
        Host,
        {
          ...props,
          testID: testID ?? (props.id ? `mapbox-${kind}-${props.id}` : `mapbox-${kind}`),
          ...(kind === 'MapView' ? { style } : { layerStyle: style }),
        },
        children,
      );
    StandIn.displayName = kind;
    return StandIn;
  };
  const Mapbox = {
    setAccessToken: jest.fn(async (token: string | null) => token),
    setTelemetryEnabled: jest.fn(),
    MapView: standIn('MapView'),
    Camera: standIn('Camera'),
    StyleImport: standIn('StyleImport'),
    ShapeSource: standIn('ShapeSource'),
    LineLayer: standIn('LineLayer'),
    CircleLayer: standIn('CircleLayer'),
    SymbolLayer: standIn('SymbolLayer'),
  };
  return { __esModule: true, default: Mapbox, ...Mapbox };
});

afterEach(() => {
  jest.clearAllMocks();
});
