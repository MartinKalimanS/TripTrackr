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
// exactly as the library would: `{ data }` already in the new order (D-22). A drag has
// three more moments the library reports, in this order: `onDragStart` when a row lifts,
// `onDragEnd` at the drop (with the data), `onActiveItemDropped` once the drop animation
// has finished; `__dragStart` and `__activeItemDropped` deliver the two around `__dropAt`.
jest.mock('react-native-sortables', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  type MockDragParams = { key: string };
  const registry: {
    onDragEnd: ((params: { data: unknown[] }) => void) | null;
    onDragStart: ((params: MockDragParams) => void) | null;
    onActiveItemDropped: ((params: MockDragParams) => void) | null;
  } = { onDragEnd: null, onDragStart: null, onActiveItemDropped: null };
  const Grid = ({
    data,
    renderItem,
    onDragEnd,
    onDragStart,
    onActiveItemDropped,
    keyExtractor,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
    onDragEnd?: (params: { data: unknown[] }) => void;
    onDragStart?: (params: MockDragParams) => void;
    onActiveItemDropped?: (params: MockDragParams) => void;
    keyExtractor?: (item: unknown) => string;
  }) => {
    registry.onDragEnd = onDragEnd ?? null;
    registry.onDragStart = onDragStart ?? null;
    registry.onActiveItemDropped = onActiveItemDropped ?? null;
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
    __dragStart: (key: string) => registry.onDragStart?.({ key }),
    __activeItemDropped: (key: string) => registry.onActiveItemDropped?.({ key }),
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
  // iOS only on the device (v57 reference); resolves on every platform here.
  enableAppSwitcherProtectionAsync: jest.fn(async () => undefined),
  disableAppSwitcherProtectionAsync: jest.fn(async () => undefined),
}));

// Haptics need a vibration motor; every suite that renders a Button reaches expo-haptics
// through useHaptics. A real import loads expo and expo-asset, which a suite that
// mocks expo-constants cannot satisfy, so nothing imports it for real under Jest.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

// Mapbox draws through native views; the globe suites assert on the props the
// app hands it, not on pixels. Each component becomes a View tagged
// `mapbox-<Kind>-<id>` (or the testID it was given) carrying every prop, so a
// suite can read a source's `shape` or a layer's `filter` and fire `onPress`
// with the `{ features }` payload the native side delivers. A layer's `style`
// is Mapbox style properties, not a React Native style, so it travels as
// `layerStyle`. `setAccessToken` resolves with the token, as the native module
// does (@rnmapbox/maps 10.3.5, RNMBXModule.setAccessToken); `clearData`, which
// empties the ambient cache, resolves once done, as both native modules do.
//
// `Camera` also answers its ref: every camera shares the recorders on
// `__camera`, so a suite asserts the stops the app asked for. `offlineManager`
// keeps packs in memory; `__emitProgress` / `__emitError` play the native
// download events to the listeners the app registered, and `__reset` empties
// it between tests (module mocks outlive a single test).
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

  const camera = {
    setCamera: jest.fn(),
    flyTo: jest.fn(),
    moveTo: jest.fn(),
    zoomTo: jest.fn(),
    fitBounds: jest.fn(),
  };
  const CameraView = standIn('Camera');
  const Camera = React.forwardRef<typeof camera, Record<string, unknown>>(
    function Camera(props, ref) {
      React.useImperativeHandle(ref, () => camera);
      return React.createElement(CameraView, props);
    },
  );

  type MockStatus = {
    name: string;
    state: number;
    percentage: number;
    completedResourceCount: number;
    completedResourceSize: number;
    completedTileCount: number;
    completedTileSize: number;
    requiredResourceCount: number;
  };
  // No parameter names: jest.mock's hoisting check reads them as variables.
  type MockListener = (...args: unknown[]) => void;
  type MockPack = {
    name: string;
    bounds: string;
    metadata: unknown;
    current: MockStatus;
    status: () => Promise<MockStatus>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
  };
  const packs = new Map<string, MockPack>();
  const listeners = new Map<string, { progress: MockListener; error?: MockListener }>();
  const makePack = (options: { name: string; bounds: unknown; metadata?: unknown }) => {
    const pack: MockPack = {
      name: options.name,
      bounds: JSON.stringify(options.bounds),
      metadata: options.metadata ?? {},
      current: {
        name: options.name,
        state: 1,
        percentage: 0,
        completedResourceCount: 0,
        completedResourceSize: 0,
        completedTileCount: 0,
        completedTileSize: 0,
        requiredResourceCount: 0,
      },
      status: async () => pack.current,
      pause: jest.fn(async () => undefined),
      resume: jest.fn(async () => undefined),
    };
    return pack;
  };
  const offlineManager = {
    createPack: jest.fn(
      async (
        options: { name: string; bounds: unknown; metadata?: unknown },
        progress: MockListener,
        error?: MockListener,
      ) => {
        if (packs.has(options.name)) {
          throw new Error(`Offline pack with name ${options.name} already exists.`);
        }
        packs.set(options.name, makePack(options));
        listeners.set(options.name, { progress, error });
      },
    ),
    getPacks: jest.fn(async () => [...packs.values()]),
    getPack: jest.fn(async (name: string) => packs.get(name)),
    deletePack: jest.fn(async (name: string) => {
      packs.delete(name);
      listeners.delete(name);
    }),
    invalidatePack: jest.fn(async () => undefined),
    subscribe: jest.fn(
      async (name: string, progress: MockListener, error?: MockListener) => {
        listeners.set(name, { progress, error });
      },
    ),
    unsubscribe: jest.fn((name: string) => {
      listeners.delete(name);
    }),
    setTileCountLimit: jest.fn(),
    setProgressEventThrottle: jest.fn(),
    resetDatabase: jest.fn(async () => {
      packs.clear();
      listeners.clear();
    }),
    __emitProgress: (name: string, update: Partial<MockStatus>) => {
      const pack = packs.get(name);
      if (!pack) return;
      pack.current = { ...pack.current, ...update };
      listeners.get(name)?.progress(pack, pack.current);
    },
    __emitError: (name: string, message: string) => {
      listeners.get(name)?.error?.(packs.get(name), { name, message });
    },
    __reset: () => {
      packs.clear();
      listeners.clear();
    },
  };

  const Mapbox = {
    setAccessToken: jest.fn(async (token: string | null) => token),
    setTelemetryEnabled: jest.fn(),
    clearData: jest.fn(async () => undefined),
    MapView: standIn('MapView'),
    Camera,
    StyleImport: standIn('StyleImport'),
    ShapeSource: standIn('ShapeSource'),
    LineLayer: standIn('LineLayer'),
    CircleLayer: standIn('CircleLayer'),
    SymbolLayer: standIn('SymbolLayer'),
    RasterDemSource: standIn('RasterDemSource'),
    Terrain: standIn('Terrain'),
    offlineManager,
    __camera: camera,
  };
  return { __esModule: true, default: Mapbox, ...Mapbox };
});

// Feature 004 (research D4-13). The kit runs on Reanimated worklets, Uniwind's Metro
// transform and a Tailwind stylesheet, none of which exist under Jest. Every suite
// therefore gets ONE stand-in for `heroui-native` (test/mocks/heroui-native.tsx):
// plain React Native nodes carrying the props the adapters pass. The real components
// are rendered once, on purpose, by test/ui-kit/real-render.test.tsx
// (`jest.requireActual`), which proves the contract the stand-in assumes.
jest.mock('heroui-native', () => require('./test/mocks/heroui-native'));

// Uniwind reads CSS variables the Metro transform registered; with no transform
// there is nothing to read. The real module is kept (`Uniwind.setTheme`, `useUniwind`,
// `withUniwind` all work). `useCSSVariable` answers a fixed placeholder for the names the
// app's own stylesheets declare, `src/theme/generated/theme.css` (every theme variable)
// and `src/global.css` (the display-face variables), read once when the module is first
// required, and `undefined` for every other name, as the real hook does for a variable no
// stylesheet defines: a typo, or a variable dropped from the theme, shows up as a failing
// test instead of a colour that is missing only on a device. A test that cares about a
// value mocks the hook itself (test/theme/css-variable-stand-in.test.ts pins this).
jest.mock('uniwind', () => {
  const actual = jest.requireActual('uniwind');
  const { readFileSync } = require('fs') as typeof import('fs');
  const { resolve } = require('path') as typeof import('path');
  const declared = new Set(
    [
      resolve(__dirname, 'src', 'theme', 'generated', 'theme.css'),
      resolve(__dirname, 'src', 'global.css'),
    ].flatMap((file) =>
      [
        ...readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .matchAll(/(--[a-z0-9-]+)\s*:/g),
      ].map((match) => match[1]),
    ),
  );
  const placeholder = '#808080';
  const answer = (name: string) => (declared.has(name) ? placeholder : undefined);
  return {
    ...actual,
    useCSSVariable: (name: string | string[]) =>
      Array.isArray(name) ? name.map(answer) : answer(name),
  };
});

afterEach(() => {
  jest.clearAllMocks();
});
