/**
 * T543 - the hero's scroll behaviour (research D5-12; spec FR-025, FR-037; contract C5-20):
 * parallax .5, a scale on overscroll, and the solid bar that takes the hero's place once the
 * picture has scrolled away.
 *
 * `useHeroCollapse(scrollY, heroHeight, topInset)` is the local seam of the chrome branch's
 * hook of the same name (T528): the maths is pure, so what is pinned here is the numbers, and
 * the hook is a thin binding of them to Reanimated styles.
 */
import { renderHook } from '@testing-library/react-native';

import {
  COLLAPSED_BAR_HEIGHT,
  COLLAPSE_FADE_DISTANCE,
  HERO_MIN_HEIGHT,
  PARALLAX_FACTOR,
  SHEET_OVERLAP,
  collapseEnd,
  collapseProgress,
  heroImageTransform,
  pinnedTranslate,
  useHeroCollapse,
} from '@/components/trip/hero-collapse';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
const mockAppearance = jest.fn();
jest.mock('@/hooks/use-appearance', () => ({
  useAppearance: () => mockAppearance() ?? { prefersLessMotion: false },
}));

describe('the numbers of the contract', () => {
  test('the hero is at least 236 dp, the bar 56 dp and the sheet overlaps the hero by 28 dp', () => {
    expect(HERO_MIN_HEIGHT).toBe(236);
    expect(COLLAPSED_BAR_HEIGHT).toBe(56);
    expect(SHEET_OVERLAP).toBe(28);
    expect(PARALLAX_FACTOR).toBe(0.5);
  });
});

describe('heroImageTransform: parallax and overscroll', () => {
  test('at rest the picture is where it was laid out', () => {
    expect(heroImageTransform(0, 236)).toEqual({ translateY: 0, scale: 1 });
  });

  test('scrolling up drags the picture down at half the speed of the content', () => {
    expect(heroImageTransform(100, 236)).toEqual({ translateY: 50, scale: 1 });
    expect(heroImageTransform(40, 236).translateY).toBe(40 * PARALLAX_FACTOR);
  });

  test('pulling down past the top stretches the picture and keeps its top edge on the top', () => {
    const { translateY, scale } = heroImageTransform(-80, 236);
    expect(scale).toBeCloseTo(1 + 80 / 236, 6);
    // Scaling about the centre lifts the top edge by half the growth (40); the content is
    // already 80 below the top, so the picture moves up by the other half.
    expect(translateY).toBe(-40);
  });

  test('never produces NaN for a hero that has not been measured yet', () => {
    const { scale } = heroImageTransform(-50, 0);
    expect(Number.isFinite(scale)).toBe(true);
  });
});

describe('collapseProgress: when the picture has gone and the bar takes over', () => {
  const hero = 236;
  const inset = 54;

  test('the bar is complete when the sheet has risen to the bottom of it', () => {
    // The sheet starts at hero - 28 in the content; the bar ends at 56 + inset.
    expect(collapseEnd(hero, inset)).toBe(
      hero - SHEET_OVERLAP - (COLLAPSED_BAR_HEIGHT + inset),
    );
  });

  test('is 0 until the fade starts, 1 from the end, and linear in between', () => {
    const end = collapseEnd(hero, inset);
    expect(collapseProgress(0, hero, inset)).toBe(0);
    expect(collapseProgress(end - COLLAPSE_FADE_DISTANCE, hero, inset)).toBe(0);
    expect(collapseProgress(end, hero, inset)).toBe(1);
    expect(collapseProgress(end + 500, hero, inset)).toBe(1);
    expect(collapseProgress(end - COLLAPSE_FADE_DISTANCE / 2, hero, inset)).toBeCloseTo(
      0.5,
      6,
    );
  });

  test('an overscroll never shows the bar', () => {
    expect(collapseProgress(-120, hero, inset)).toBe(0);
  });

  test('a taller hero (large text) collapses later, never earlier', () => {
    expect(collapseEnd(400, inset)).toBeGreaterThan(collapseEnd(236, inset));
  });

  test('a hero shorter than the bar is collapsed from the start of the fade, never negative', () => {
    expect(collapseEnd(10, inset)).toBeGreaterThanOrEqual(0);
    expect(collapseProgress(1000, 10, inset)).toBe(1);
  });
});

describe('reduced motion (FR-027, FR-073): nothing moves and nothing fades', () => {
  test('the picture neither shifts nor stretches', () => {
    expect(heroImageTransform(100, 236, true)).toEqual({ translateY: 0, scale: 1 });
    expect(heroImageTransform(-80, 236, true)).toEqual({ translateY: 0, scale: 1 });
  });

  test('the bar switches on at once when the sheet reaches it, with no fade before', () => {
    const end = collapseEnd(236, 54);
    expect(collapseProgress(end - 1, 236, 54, true)).toBe(0);
    expect(collapseProgress(end - COLLAPSE_FADE_DISTANCE / 2, 236, 54, true)).toBe(0);
    expect(collapseProgress(end, 236, 54, true)).toBe(1);
  });
});

describe('pinnedTranslate: a strip that scrolls with the content, then stays under the bar', () => {
  test('follows the content while it is below the pin line', () => {
    expect(pinnedTranslate(500, 0, 110)).toBe(500);
    expect(pinnedTranslate(500, 200, 110)).toBe(300);
  });

  test('stops at the pin line and stays there however far the content scrolls', () => {
    expect(pinnedTranslate(500, 390, 110)).toBe(110);
    expect(pinnedTranslate(500, 5000, 110)).toBe(110);
  });

  test('moves down with an overscroll, as the content does', () => {
    expect(pinnedTranslate(500, -60, 110)).toBe(560);
  });
});

describe('useHeroCollapse(scrollY, heroHeight, topInset)', () => {
  afterEach(() => mockAppearance.mockReset());

  const run = async (scroll: number) => {
    const { result } = await renderHook(() =>
      useHeroCollapse({ value: scroll } as never, { value: 236 } as never, 54),
    );
    return result.current;
  };

  test('at the top: no parallax, the bar is invisible', async () => {
    const { imageStyle, barStyle, progress } = (await run(0)) as unknown as {
      imageStyle: { transform: Record<string, number>[] };
      barStyle: { opacity: number };
      progress: { value: number };
    };
    expect(imageStyle.transform).toEqual([{ translateY: 0 }, { scale: 1 }]);
    expect(barStyle.opacity).toBe(0);
    expect(progress.value).toBe(0);
  });

  test('scrolled past the hero: the picture has moved at half speed and the bar is opaque', async () => {
    const { imageStyle, barStyle, progress } = (await run(300)) as unknown as {
      imageStyle: { transform: Record<string, number>[] };
      barStyle: { opacity: number };
      progress: { value: number };
    };
    expect(imageStyle.transform).toEqual([{ translateY: 150 }, { scale: 1 }]);
    expect(barStyle.opacity).toBe(1);
    expect(progress.value).toBe(1);
  });

  test('under reduced motion the picture stays put and the bar steps in only when the hero has gone', async () => {
    mockAppearance.mockReturnValue({ prefersLessMotion: true });
    const early = (await run(90)) as unknown as {
      imageStyle: { transform: Record<string, number>[] };
      barStyle: { opacity: number };
    };
    expect(early.imageStyle.transform).toEqual([{ translateY: 0 }, { scale: 1 }]);
    expect(early.barStyle.opacity).toBe(0);
    const late = (await run(300)) as unknown as { barStyle: { opacity: number } };
    expect(late.barStyle.opacity).toBe(1);
  });
});
