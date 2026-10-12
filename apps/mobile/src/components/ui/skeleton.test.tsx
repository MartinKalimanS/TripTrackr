/**
 * T522 - contract C5-28, research D5-14, FR-064, FR-066: the shimmering placeholder every
 * skeleton is built from. The kit's SkeletonGroup and its Item are plain host views under
 * Jest that carry every prop they were given, so what is asserted is what the adapter ASKED
 * of the kit: the `skeleton` fill, the 1.4 s shimmer in the `skeletonHighlight` colour, and
 * no shimmer at all under reduced motion. That the provider's `animation: 'disable-all'`
 * stops the kit's own animation is the kit's (read from its source) and a device check.
 */
import { render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { View } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { Motion } from '@/theme';

import { Bone, PhotoBone, ShimmerGroup, useSkeletonMotion } from './skeleton';

jest.mock('@/hooks/use-appearance');
jest.mock('expo-symbols', () => {
  const { View: MockView } = require('react-native');
  return {
    SymbolView: (props: Record<string, unknown>) => (
      <MockView testID="symbol" {...props} />
    ),
  };
});

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ...overrides,
  } as AppearanceContext);
}

beforeEach(() => {
  mockAppearance();
  jest
    .spyOn(HeroUI, 'useThemeColor')
    .mockImplementation(((token: string) => `colour:${token}`) as never);
});
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);

describe('useSkeletonMotion', () => {
  test('is the 1.4 s shimmer in the skeleton highlight colour', async () => {
    function Probe() {
      const motion = useSkeletonMotion();
      return <View testID="probe" {...(motion as object)} />;
    }
    await render(<Probe />);
    const probe = screen.getByTestId('probe');
    expect(probe.props.variant).toBe('shimmer');
    expect(probe.props.animation).toEqual({
      shimmer: {
        duration: Motion.shimmerMs,
        highlightColor: 'colour:skeleton-highlight',
      },
    });
    expect(Motion.shimmerMs).toBe(1400);
  });

  test('is still under reduced motion: no variant, no animation to run', async () => {
    mockAppearance({ prefersLessMotion: true });
    function Probe() {
      const motion = useSkeletonMotion();
      return <View testID="probe" {...(motion as object)} />;
    }
    await render(<Probe />);
    expect(screen.getByTestId('probe').props.variant).toBe('none');
    expect(screen.getByTestId('probe').props.animation).toBe('disable-all');
  });
});

describe('<ShimmerGroup> and <Bone>', () => {
  test('the group asks the kit for the shimmer, so every bone inside inherits it', async () => {
    await render(
      <ShimmerGroup testID="group" className="gap-2">
        <Bone className="h-4 w-1/2 rounded-lg" />
      </ShimmerGroup>,
    );
    const group = screen.getByTestId('group');
    expect(group.props.variant).toBe('shimmer');
    expect(group.props.animation.shimmer.duration).toBe(1400);
    expect(tokens(group.props.className)).toContain('gap-2');
  });

  test('under reduced motion the group is static', async () => {
    mockAppearance({ prefersLessMotion: true });
    await render(<ShimmerGroup testID="group" />);
    expect(screen.getByTestId('group').props.variant).toBe('none');
  });

  test('a bone is the skeleton fill in the shape its classes give it', async () => {
    await render(
      <ShimmerGroup>
        <Bone testID="bone" className="h-4 w-1/2 rounded-lg" />
      </ShimmerGroup>,
    );
    expect(tokens(screen.getByTestId('bone').props.className)).toEqual(
      expect.arrayContaining(['bg-skeleton', 'h-4', 'w-1/2', 'rounded-lg']),
    );
  });

  test('a bone is not announced: it carries no role, no name and no focus', async () => {
    await render(
      <ShimmerGroup>
        <Bone testID="bone" className="h-4" />
      </ShimmerGroup>,
    );
    const bone = screen.getByTestId('bone');
    expect(bone.props.accessible).toBeUndefined();
    expect(bone.props.accessibilityRole).toBeUndefined();
    expect(bone.props.accessibilityLabel).toBeUndefined();
  });

  test('colours are semantic classes only', async () => {
    await render(
      <ShimmerGroup>
        <Bone testID="bone" className="h-4" />
      </ShimmerGroup>,
    );
    for (const token of tokens(screen.getByTestId('bone').props.className)) {
      expect(token).not.toMatch(/\[#|rgb|hsl/);
    }
  });
});

describe('<PhotoBone> - a photograph skeleton carries a pin glyph (C5-28)', () => {
  test('is a bone with a decorative pin in the middle of it', async () => {
    await render(
      <ShimmerGroup>
        <PhotoBone testID="photo" className="aspect-[16/10] rounded-3xl" />
      </ShimmerGroup>,
    );
    expect(tokens(screen.getByTestId('photo').props.className)).toEqual(
      expect.arrayContaining(['bg-skeleton', 'aspect-[16/10]', 'rounded-3xl']),
    );
    const symbol = screen.getByTestId('symbol', hidden);
    expect(symbol.props.name).toEqual({ ios: 'mappin', android: 'location_on' });
    expect(symbol.props.size).toBe(24);
    expect(screen.queryByTestId('symbol')).toBeNull();
    const glyph = screen.getByTestId('photo-glyph', hidden);
    expect(tokens(glyph.props.className)).toEqual(
      expect.arrayContaining(['absolute', 'items-center', 'justify-center']),
    );
    expect(glyph.props.pointerEvents).toBe('none');
  });
});
