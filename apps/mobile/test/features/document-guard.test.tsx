/**
 * T119 — screenshots and recordings are blocked while a document is shown
 * (FR-034; Acceptance Scenario 5.4), and the iOS app switcher never shows a
 * signed-in screen (research D-05).
 *
 * `expo-screen-capture` runs for REAL here, over jest-expo's native-module
 * stand-in, because the property that matters lives in its JavaScript: it
 * re-allows capture when the last KEY is released. Two document screens
 * sharing a key would re-allow screenshots the moment either unmounted, with
 * a boarding pass still on screen — so each guard must hold its own key.
 */
import { render } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';

import {
  useAppSwitcherProtection,
  useScreenCaptureGuard,
} from '@/features/documents/use-screen-capture-guard';
import { Sentry } from '@/lib/sentry';

jest.mock('expo-screen-capture', () => jest.requireActual('expo-screen-capture'));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const native = jest.requireActual('expo-screen-capture/build/ExpoScreenCapture')
  .default as {
  preventScreenCapture: jest.Mock;
  allowScreenCapture: jest.Mock;
  enableAppSwitcherProtection: jest.Mock;
  disableAppSwitcherProtection: jest.Mock;
};

function Guarded({ label }: { label: string }) {
  useScreenCaptureGuard();
  return <Text>{label}</Text>;
}

function Shell({ signedIn }: { signedIn: boolean }) {
  useAppSwitcherProtection(signedIn);
  return <Text>shell</Text>;
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('useScreenCaptureGuard (FR-034)', () => {
  test('blocks capture while a document screen is mounted, and allows it again after', async () => {
    const screen = await render(<Guarded label="viewer" />);
    await settle();
    expect(native.preventScreenCapture).toHaveBeenCalledTimes(1);

    await screen.unmount();
    await settle();
    expect(native.allowScreenCapture).toHaveBeenCalledTimes(1);
  });

  test('closing one document screen never re-allows capture while another is still shown', async () => {
    const screen = await render(
      <>
        <Guarded label="list" />
        <Guarded label="viewer" />
      </>,
    );
    await settle();

    await screen.rerender(<Guarded label="list" />);
    await settle();
    expect(native.allowScreenCapture).not.toHaveBeenCalled();

    await screen.unmount();
    await settle();
    expect(native.allowScreenCapture).toHaveBeenCalledTimes(1);
  });
});

describe('useAppSwitcherProtection (research D-05)', () => {
  test('on iOS, blurs the app switcher at full strength while signed in, and stops on sign-out', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      const screen = await render(<Shell signedIn />);
      await settle();
      expect(native.enableAppSwitcherProtection).toHaveBeenCalledWith(1);

      await screen.rerender(<Shell signedIn={false} />);
      await settle();
      expect(native.disableAppSwitcherProtection).toHaveBeenCalledTimes(1);
    } finally {
      os.restore();
    }
  });

  test('on iOS, stops when the shell unmounts', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      const screen = await render(<Shell signedIn />);
      await settle();
      await screen.unmount();
      await settle();
      expect(native.disableAppSwitcherProtection).toHaveBeenCalledTimes(1);
    } finally {
      os.restore();
    }
  });

  test('signed out, nothing is enabled', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      await render(<Shell signedIn={false} />);
      await settle();
      expect(native.enableAppSwitcherProtection).not.toHaveBeenCalled();
    } finally {
      os.restore();
    }
  });

  test('on Android, nothing is called — FLAG_SECURE already blanks the recents preview', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      const screen = await render(<Shell signedIn />);
      await settle();
      await screen.unmount();
      await settle();
      expect(native.enableAppSwitcherProtection).not.toHaveBeenCalled();
      expect(native.disableAppSwitcherProtection).not.toHaveBeenCalled();
    } finally {
      os.restore();
    }
  });

  test('a protection the system refuses is reported, never thrown into the shell', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    const refusal = new Error('UIWindow unavailable');
    native.enableAppSwitcherProtection.mockRejectedValueOnce(refusal);
    try {
      await render(<Shell signedIn />);
      await settle();
      expect(Sentry.captureException).toHaveBeenCalledWith(refusal);
    } finally {
      os.restore();
    }
  });
});
