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
    __reset: () => store.clear(),
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
