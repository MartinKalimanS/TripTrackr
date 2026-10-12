/**
 * The Jest stand-in for `react-native-view-shot` (feature 005, research D5-04, D5-19).
 *
 * `jest.setup.ts` installs it for every suite with
 * `jest.mock('react-native-view-shot', () => require('./test/mocks/react-native-view-shot'))`.
 * The real module calls the `RNViewShot` native module, which Jest does not have.
 * `test/mocks/native-batch.test.tsx` pins the shape; the roundel capture itself (a hidden
 * laid-out view, colour fidelity) is the device check V2 (tasks T508).
 *
 * What it does, and does not do:
 * - `captureRef(view, options)` resolves what the native module resolves for the
 *   requested `result`: a temporary file URI (the default, `tmpfile`), the raw base64
 *   string, or a `data:` URI with its header. The file name carries the requested format
 *   (`png` by default). It REJECTS a view that is not there (`null`, or a ref whose
 *   `current` is `null`) with the real message, as `findNodeHandle` does for a view that
 *   is not laid out, so a capture attempted too early fails under Jest as on a phone.
 * - `captureScreen` and `releaseCapture` exist. Every function is a `jest.fn`, so a suite
 *   asserts the options it asked for (`toHaveBeenCalledWith`).
 * - The default export is the `ViewShot` component: a collapsable-off `View` whose ref
 *   is the host node with `capture()` attached, as the real one. `captureMode`,
 *   `onCapture` and `onCaptureFailure` are carried on the host but never performed: no
 *   automatic capture happens under Jest.
 * - It draws nothing: the URI points nowhere.
 */
import { createElement, type ComponentType, type ReactNode, type Ref } from 'react';
import { View } from 'react-native';

type StandInProps = Record<string, unknown>;
type CaptureOptions = { format?: string; result?: string };
const Host = View as unknown as ComponentType<StandInProps>;

/** A 1 by 1 transparent PNG, the payload of the base64 answers. */
const BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==';

function answer({ format = 'png', result = 'tmpfile' }: CaptureOptions = {}): string {
  if (result === 'data-uri') {
    return `data:image/${format === 'jpg' ? 'jpeg' : format};base64,${BASE64}`;
  }
  if (result === 'tmpfile') {
    return `file:///cache/ReactNative-snapshot-image.${format}`;
  }
  return BASE64;
}

/** The native module's own rule: a view with no native node cannot be captured. */
function isLaidOut(view: unknown): boolean {
  if (view && typeof view === 'object' && 'current' in view) return Boolean(view.current);
  return Boolean(view);
}

export const captureRef = jest.fn(async (view: unknown, options?: CaptureOptions) => {
  if (!isLaidOut(view)) {
    throw new Error(`findNodeHandle failed to resolve view=${String(view)}`);
  }
  return answer(options);
});

export const captureScreen = jest.fn(async (options?: CaptureOptions) => answer(options));

export const releaseCapture = jest.fn<void, [uri: string]>();

type CaptureNode = { capture?: () => Promise<string> } | null;

function ViewShotComponent({
  ref,
  children,
  options,
  ...props
}: StandInProps & {
  ref?: Ref<CaptureNode>;
  options?: CaptureOptions;
  children?: ReactNode;
}) {
  const attach = (node: CaptureNode) => {
    if (node) node.capture = () => captureRef({ current: node }, options);
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as { current: CaptureNode }).current = node;
  };
  return createElement(Host, { collapsable: false, ...props, ref: attach }, children);
}

const ViewShot = Object.assign(ViewShotComponent, { captureRef, releaseCapture });

export default ViewShot;
