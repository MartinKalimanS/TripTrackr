/**
 * T522 - contract C5-28 (`PermissionState`), research D5-14, FR-065: the camera and
 * photographs denial screens. An icon, words, "Open Settings" as a SECONDARY button (never
 * a primary: the screen has its own), and an optional way round it ("Choose files instead").
 *
 * The kit's Button is a plain Pressable under Jest that forwards every prop, so the tests
 * read what the adapter asked of it.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { anyGlyph, glyphsIn } from '../../../test/helpers/icons';
import { PermissionState } from './permission-state';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
  } as AppearanceContext);
});
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const CAMERA_OFF = 'camera';
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);

const photos = (props: Record<string, unknown> = {}) => (
  <PermissionState
    icon={CAMERA_OFF}
    title="Photos access is off"
    detail="Turn it on in Settings to add photos from your library."
    onOpenSettings={jest.fn()}
    testID="permission"
    {...props}
  />
);

describe('<PermissionState> - words, an icon and a way forward', () => {
  test('says what is off and what to do, in the ink and the muted ink', async () => {
    await render(photos());
    expect(tokens(screen.getByText('Photos access is off').props.className)).toEqual(
      expect.arrayContaining(['text-[17px]', 'text-foreground', 'text-center']),
    );
    expect(
      tokens(
        screen.getByText('Turn it on in Settings to add photos from your library.').props
          .className,
      ),
    ).toEqual(expect.arrayContaining(['text-muted', 'text-center']));
  });

  test('the icon is decorative and sits in a cream roundel', async () => {
    await render(photos());
    expect(glyphsIn()).toEqual([
      expect.objectContaining({ name: CAMERA_OFF, size: 24, weight: 'regular' }),
    ]);
    expect(screen.queryByTestId(anyGlyph)).toBeNull();
    expect(tokens(screen.getByTestId('permission-icon', hidden).props.className)).toEqual(
      expect.arrayContaining(['bg-surface-secondary', 'rounded-full']),
    );
  });

  test('Open Settings is a SECONDARY button that calls back, and there is no primary', async () => {
    const onOpenSettings = jest.fn();
    await render(photos({ onOpenSettings, settingsTestID: 'photos-settings' }));
    const settings = screen.getByTestId('photos-settings');
    expect(settings).toBe(screen.getByLabelText('Open Settings'));
    expect(settings.props.accessibilityRole).toBe('button');
    expect(settings.props.variant).toBe('secondary');
    expect(screen.getByText('Open Settings')).toBeTruthy();
    expect(
      screen.getAllByRole('button').filter((node) => node.props.variant === 'primary'),
    ).toHaveLength(0);
    await fireEvent.press(settings);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  test('the label of the settings button is the screen\u2019s to choose', async () => {
    await render(photos({ settingsLabel: 'Open Camera settings' }));
    expect(screen.getByLabelText('Open Camera settings')).toBeTruthy();
    expect(screen.queryByLabelText('Open Settings')).toBeNull();
  });

  test('an alternative is a quiet text button after it, so the screen is never a dead end', async () => {
    const onPress = jest.fn();
    await render(
      photos({
        alternative: { label: 'Choose files instead', onPress, testID: 'files' },
      }),
    );
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels).toEqual(['Open Settings', 'Choose files instead']);
    const alternative = screen.getByTestId('files');
    expect(alternative.props.variant).toBe('ghost');
    await fireEvent.press(alternative);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('has no alternative and no detail unless given', async () => {
    await render(photos({ detail: undefined }));
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getAllByText(/./)).toHaveLength(2);
  });

  test('is one flat, border-free surface carrying its testID and a live region on request', async () => {
    await render(photos({ accessibilityLiveRegion: 'polite' }));
    const surface = screen.getByTestId('permission');
    expect(tokens(surface.props.className)).toEqual(
      expect.arrayContaining(['bg-surface', 'rounded-2xl', 'p-6', 'items-center']),
    );
    expect(tokens(surface.props.className).some((name) => /^border/.test(name))).toBe(
      false,
    );
    expect(surface.props.accessibilityLiveRegion).toBe('polite');
  });
});
