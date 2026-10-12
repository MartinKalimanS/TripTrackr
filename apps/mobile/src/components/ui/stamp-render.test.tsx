/**
 * T523 - the stamps through the REAL `react-native-svg` 15.15.4 (not the stand-in of
 * `stamp.test.tsx`): every shape in every ink draws without a warning, as a mask over the
 * drawing, with its circular text on a real `TextPath` where the shape has one. What Jest
 * cannot say is whether a device draws the embedded face on a `TextPath` and applies the
 * mask: that is device check V5 (T511).
 */
import { render, screen } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { GhostStamp, Stamp } from './stamp';
import { STAMP_INKS, STAMP_SHAPES, stampSpec } from './stamp-spec';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    themeName: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ready: true,
  });
});

const types = (): string[] => {
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    const host = node as { type: string; children: unknown[] | null };
    found.push(host.type);
    (host.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  return found;
};

describe('the real react-native-svg draws every stamp', () => {
  test.each(STAMP_SHAPES)('%s, in all four inks', async (shape) => {
    for (const ink of STAMP_INKS) {
      const spec = {
        ...stampSpec('PT', '2026-10-12', 'Lisboa'),
        shape,
        ink,
        perforated: true,
      };
      const view = await render(<Stamp spec={spec} />);
      const drawn = types();
      expect(drawn).toContain('RNSVGSvgView');
      expect(drawn).toContain('RNSVGMask');
      expect(drawn).toContain('RNSVGText');
      await view.unmount();
    }
  });

  test('the circle and the scallop run their text along a real TextPath', async () => {
    const circle = { ...stampSpec('PT', '2026-10-12'), shape: 'circle' as const };
    const scallop = { ...stampSpec('PT', '2026-10-12'), shape: 'scallop' as const };
    const first = await render(<Stamp spec={circle} />);
    expect(types().filter((type) => type === 'RNSVGTextPath')).toHaveLength(2);
    await first.unmount();
    await render(<Stamp spec={scallop} />);
    expect(types().filter((type) => type === 'RNSVGTextPath')).toHaveLength(1);
  });

  test('the rect writes on lines: no TextPath', async () => {
    await render(<Stamp spec={{ ...stampSpec('PT', '2026-10-12'), shape: 'rect' }} />);
    expect(types()).not.toContain('RNSVGTextPath');
  });

  test('a ghost is a dashed outline with no text and no mask', async () => {
    await render(<GhostStamp />);
    const drawn = types();
    expect(drawn).toContain('RNSVGCircle');
    expect(drawn).not.toContain('RNSVGText');
    expect(drawn).not.toContain('RNSVGMask');
  });
});
