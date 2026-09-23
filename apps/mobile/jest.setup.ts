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

// Screen-capture blocking (FR-032, documents) has no meaning off-device.
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
  usePreventScreenCapture: jest.fn(),
}));

// Mapbox draws through a native view; the globe suites assert on props, not pixels.
jest.mock('@rnmapbox/maps', () => ({
  __esModule: true,
  default: { setAccessToken: jest.fn() },
  MapView: 'MapView',
  Camera: 'Camera',
  ShapeSource: 'ShapeSource',
  LineLayer: 'LineLayer',
  CircleLayer: 'CircleLayer',
  SymbolLayer: 'SymbolLayer',
  StyleURL: { Dark: 'mapbox://styles/mapbox/dark-v11' },
}));

afterEach(() => {
  jest.clearAllMocks();
});
