/**
 * A fuller `react-native-worklets` double for the suites that load the REAL kit
 * (`test/ui-kit/real-render.test.tsx`).
 *
 * `jest.setup.ts` mocks the module with the single function the app itself uses
 * (`scheduleOnRN`). Reanimated's own `mock` entry point, which the kit needs, pulls
 * in the rest of the worklets API at import time, and none of it can run without
 * the native runtime, so each call runs inline on the JS thread. Modelled on the
 * public SDK 57 reference app (github.com/AdiRishi/expo-uniwind-starter,
 * `apps/mobile/tests/testing-utils/jest-setup.ts`), trimmed to what loading and
 * rendering the kit exercises.
 */
type AnyFunction = (...args: unknown[]) => unknown;

const identity = <T>(value: T): T => value;
const runInline =
  (fn: AnyFunction) =>
  (...args: unknown[]) =>
    fn(...args);

module.exports = {
  __esModule: true,
  callMicrotasks: jest.fn(),
  createSerializable: identity,
  createSynchronizable: identity,
  createWorkletRuntime: jest.fn(),
  executeOnUIRuntimeSync: (fn: AnyFunction) => fn(),
  getRuntimeKind: () => 'react-native',
  getStaticFeatureFlag: () => false,
  isSerializableRef: () => true,
  isSynchronizable: () => false,
  isWorkletFunction: () => false,
  makeShareable: identity,
  makeShareableCloneOnUIRecursive: identity,
  makeShareableCloneRecursive: identity,
  runOnJS: runInline,
  runOnRuntime: identity,
  runOnUI: runInline,
  runOnUIAsync:
    (fn: AnyFunction) =>
    async (...args: unknown[]) =>
      fn(...args),
  runOnUISync: (fn: AnyFunction) => fn(),
  scheduleOnRN: (fn: AnyFunction, ...args: unknown[]) => fn(...args),
  scheduleOnUI: (fn: AnyFunction, ...args: unknown[]) => fn(...args),
  serializableMappingCache: new Map(),
  setDynamicFeatureFlag: jest.fn(),
  shareableMappingCache: new Map(),
  unstable_eventLoopTask: jest.fn(),
  WorkletsModule: {},
};
