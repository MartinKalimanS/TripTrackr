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
import { PaletteNames, Palettes, type PaletteName } from '@/theme/palette';

import { MediaFrame } from './media-frame';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(themeName: PaletteName = 'light') {
  useAppearance.mockReturnValue({
    theme: themeName.startsWith('dark') ? 'dark' : 'light',
    themeName,
    prefersMoreContrast: themeName.endsWith('-contrast'),
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    tokens: Colors[themeName],
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
    expect(style.borderColor).toBe(Palettes.light.border);
  });

  test.each(PaletteNames)(
    'draws its edge in the %s palette’s border, increased contrast included',
    async (themeName) => {
      mockAppearance(themeName);
      await render(
        <MediaFrame testID="photo">
          <Text>photo</Text>
        </MediaFrame>,
      );
      expect(styleOf('photo').borderColor).toBe(Palettes[themeName].border);
    },
  );

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
