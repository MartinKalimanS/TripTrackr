/**
 * T060–T061 — US6, contract C12.
 *
 * The globe and the photo library are what travellers open the app to see. A
 * shadow cast across map imagery is not merely ugly — it can be mistaken for
 * terrain, which makes this a correctness problem rather than an aesthetic one.
 */
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { MediaFrame } from './media-frame';
import { PressableSurface } from './pressable-surface';
import { Surface } from './surface';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  const theme = overrides.theme ?? 'light';
  useAppearance.mockReturnValue({
    theme,
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    elevationProfile: 'full',
    tokens: Colors[theme],
    ...overrides,
  } as AppearanceContext);
}

function styleOf(testID: string) {
  const style = screen.getByTestId(testID).props.style;
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
}

beforeEach(() => mockAppearance());

describe('<MediaFrame> — contract C12', () => {
  test('casts no shadow, tint, or overlay across its content (FR-024)', async () => {
    await render(
      <MediaFrame testID="globe">
        <Text>map</Text>
      </MediaFrame>,
    );
    const style = styleOf('globe');
    expect(style.boxShadow).toBeUndefined();
    expect(style.opacity).toBeUndefined();
    // No scrim: a translucent fill over the map is the same defect by another
    // name.
    expect(style.backgroundColor).toBeUndefined();
  });

  test('keeps a visible boundary against a similar-toned surface (FR-026)', async () => {
    await render(
      <MediaFrame testID="photo">
        <Text>photo</Text>
      </MediaFrame>,
    );
    const style = styleOf('photo');
    // A near-white photo on the light canvas would otherwise bleed into it.
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBe(Colors.light.border);
  });

  test('clips its content to the frame radius rather than letting it spill', async () => {
    await render(
      <MediaFrame testID="photo">
        <Text>photo</Text>
      </MediaFrame>,
    );
    expect(styleOf('photo').overflow).toBe('hidden');
  });

  test('renders its content unchanged', async () => {
    await render(
      <MediaFrame testID="globe">
        <Text>map</Text>
      </MediaFrame>,
    );
    expect(screen.getByText('map')).toBeTruthy();
  });
});

describe('controls placed over media — FR-025', () => {
  test.each(['light', 'dark'] as const)(
    'are opaque and bordered in the %s theme, so they read against any imagery',
    async (theme) => {
      mockAppearance({ theme });
      await render(
        <MediaFrame testID="globe">
          <PressableSurface accessibilityLabel="Recentre map" onPress={jest.fn()} />
        </MediaFrame>,
      );
      const control = Object.assign(
        {},
        ...[screen.getByLabelText('Recentre map').props.style]
          .flat(Infinity)
          .filter(Boolean),
      );
      // Opaque: a translucent control over a dark map area becomes unreadable.
      expect(String(control.backgroundColor)).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(control.opacity).toBeUndefined();
      // Bordered: the boundary is what separates it from the imagery beneath.
      expect(control.borderWidth).toBeGreaterThan(0);
      expect(control.borderColor).toBe(Colors[theme].border);
    },
  );
});

describe('<Surface media> — FR-024', () => {
  test('suppresses every shadow when framing media', async () => {
    await render(<Surface testID="map" treatment="raised" media />);
    expect(styleOf('map').boxShadow).toBeUndefined();
  });

  test('still applies shadows when NOT framing media', async () => {
    await render(<Surface testID="card" treatment="raised" />);
    expect(styleOf('card').boxShadow).toHaveLength(2);
  });
});
