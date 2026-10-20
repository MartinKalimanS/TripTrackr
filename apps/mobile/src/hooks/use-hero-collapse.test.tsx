/**
 * T528 - the hero collapse of the trip screen (feature 005, research D5-12, contract C5-20 and
 * C5-32; FR-025, FR-027, FR-073): the picture moves at half the speed of the page (parallax .5),
 * stretches when the page is pulled down, the title in the hero cross-fades into the solid 56 dp
 * header once the picture has scrolled away, and the scrim over the status bar fades out as the
 * header takes over. Movement and fade only; under reduced motion the picture does not move and
 * the header switches at once, with every state still shown.
 *
 * The arithmetic is a pure function (`heroCollapse`) so it is tested on numbers; the hook turns
 * it into the styles of four animated views from a scroll offset (`useScrollOffset`). The
 * stand-in Reanimated re-renders on a write and runs the style updater at render, so a scroll is
 * simulated by setting `scrollY.value`; how it feels is a device check.
 */
import { act, renderHook } from '@testing-library/react-native';
import { useSharedValue } from 'react-native-reanimated';

import { appearanceOf } from '../../test/helpers/appearance';

import {
  HeroMetrics,
  heroCollapse,
  useHeroCollapse,
  type HeroCollapseConfig,
} from './use-hero-collapse';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

beforeEach(() => useAppearance.mockReturnValue(appearanceOf('light')));
afterEach(() => jest.restoreAllMocks());

/** A 300 dp hero under a 50 dp status bar: the picture is gone after 300 - (56 + 50) = 194. */
const CONFIG: HeroCollapseConfig = { heroHeight: 300, topInset: 50 };
const RANGE = 300 - (HeroMetrics.headerHeight + 50);

describe('HeroMetrics - the numbers of the contract', () => {
  test('a hero is at least 236 dp, the solid header is 56 dp, the parallax is one half', () => {
    expect(HeroMetrics.minHeight).toBe(236);
    expect(HeroMetrics.headerHeight).toBe(56);
    expect(HeroMetrics.parallax).toBe(0.5);
  });

  test('the cross-fade happens in the last part of the collapse, and has a width', () => {
    expect(HeroMetrics.fadeStart).toBeGreaterThan(0);
    expect(HeroMetrics.fadeStart).toBeLessThan(1);
  });
});

describe('heroCollapse() - at rest and while scrolling', () => {
  test('at rest the picture is untouched, the hero title is shown and the header is not', () => {
    expect(heroCollapse(0, CONFIG)).toEqual({
      progress: 0,
      translateY: 0,
      scale: 1,
      titleOpacity: 1,
      barOpacity: 0,
      scrimOpacity: 1,
      collapsed: false,
    });
  });

  test('the picture moves at half the speed of the page (parallax .5)', () => {
    expect(heroCollapse(100, CONFIG).translateY).toBe(50);
    expect(heroCollapse(40, CONFIG).translateY).toBe(20);
    expect(heroCollapse(100, CONFIG).scale).toBe(1);
  });

  test('progress is the scroll over the distance until the hero meets the header, clamped to 0 to 1', () => {
    expect(heroCollapse(RANGE / 2, CONFIG).progress).toBeCloseTo(0.5, 10);
    expect(heroCollapse(RANGE, CONFIG).progress).toBe(1);
    expect(heroCollapse(RANGE * 10, CONFIG).progress).toBe(1);
    expect(heroCollapse(-50, CONFIG).progress).toBe(0);
  });

  test('once the picture has scrolled away the header is solid, the hero title and scrim are gone', () => {
    const collapsed = heroCollapse(RANGE, CONFIG);
    expect(collapsed).toMatchObject({
      collapsed: true,
      barOpacity: 1,
      titleOpacity: 0,
      scrimOpacity: 0,
    });
    expect(heroCollapse(RANGE * 5, CONFIG).collapsed).toBe(true);
    expect(heroCollapse(RANGE - 1, CONFIG).collapsed).toBe(false);
  });

  test('nothing fades before the fade starts', () => {
    const before = heroCollapse(RANGE * HeroMetrics.fadeStart * 0.99, CONFIG);
    expect(before).toMatchObject({ titleOpacity: 1, barOpacity: 0, scrimOpacity: 1 });
  });

  test('the title cross-fades into the header: one fades out exactly as the other fades in', () => {
    for (let offset = 0; offset <= RANGE + 40; offset += 7) {
      const { titleOpacity, barOpacity, scrimOpacity } = heroCollapse(offset, CONFIG);
      expect(titleOpacity + barOpacity).toBeCloseTo(1, 10);
      expect(scrimOpacity).toBeCloseTo(titleOpacity, 10);
      expect(titleOpacity).toBeGreaterThanOrEqual(0);
      expect(titleOpacity).toBeLessThanOrEqual(1);
    }
  });

  test('is monotonic: scrolling further never brings the hero title back', () => {
    let previous = 1;
    for (let offset = 0; offset <= RANGE + 40; offset += 3) {
      const { titleOpacity } = heroCollapse(offset, CONFIG);
      expect(titleOpacity).toBeLessThanOrEqual(previous + 1e-12);
      previous = titleOpacity;
    }
  });

  test('is half way through the fade half way between its start and the end', () => {
    const middle = (HeroMetrics.fadeStart + 1) / 2;
    expect(heroCollapse(RANGE * middle, CONFIG).barOpacity).toBeCloseTo(0.5, 10);
  });
});

describe('heroCollapse() - pulled down past the top', () => {
  test('the picture stretches to cover the gap and stays pinned to the top', () => {
    const pulled = heroCollapse(-100, CONFIG);
    expect(pulled.scale).toBeCloseTo(1 + 100 / 300, 10);
    // Scaled about its centre, it is moved up by half the pull so its top edge stays put.
    expect(pulled.translateY).toBe(-50);
    expect(pulled).toMatchObject({ progress: 0, titleOpacity: 1, collapsed: false });
  });

  test('the stretch grows with the pull', () => {
    expect(heroCollapse(-200, CONFIG).scale).toBeGreaterThan(
      heroCollapse(-50, CONFIG).scale,
    );
  });
});

describe('heroCollapse() - reduced motion (FR-073)', () => {
  const reduced = { ...CONFIG, reducedMotion: true };

  test('the picture does not move or stretch, whatever the scroll', () => {
    for (const offset of [-120, 0, 60, RANGE, RANGE * 3]) {
      const result = heroCollapse(offset, reduced);
      expect(result.translateY).toBe(0);
      expect(result.scale).toBe(1);
    }
  });

  test('the header switches at once when the picture has gone, with no fade between', () => {
    expect(heroCollapse(RANGE * 0.9, reduced)).toMatchObject({
      titleOpacity: 1,
      barOpacity: 0,
      scrimOpacity: 1,
      collapsed: false,
    });
    expect(heroCollapse(RANGE, reduced)).toMatchObject({
      titleOpacity: 0,
      barOpacity: 1,
      scrimOpacity: 0,
      collapsed: true,
    });
  });
});

describe('heroCollapse() - degenerate input', () => {
  test('a hero shorter than the header still answers real numbers', () => {
    const result = heroCollapse(10, { heroHeight: 40, topInset: 50 });
    for (const value of Object.values(result)) {
      if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
    }
    expect(result.collapsed).toBe(true);
  });

  test('is pure: the same input gives the same output and the config is not touched', () => {
    const config = Object.freeze({ ...CONFIG });
    expect(heroCollapse(77, config)).toEqual(heroCollapse(77, config));
    expect(config).toEqual(CONFIG);
  });
});

describe('useHeroCollapse() - the styles of the four animated views', () => {
  function mount(config: HeroCollapseConfig = CONFIG) {
    return renderHook(() => {
      const scrollY = useSharedValue(0);
      return { scrollY, styles: useHeroCollapse(scrollY, config) };
    });
  }

  test('at rest: no offset, a visible title, no header, the full scrim', async () => {
    const { result } = await mount();
    const { image, title, bar, scrim } = result.current.styles;

    expect(image).toEqual({ transform: [{ translateY: 0 }, { scale: 1 }] });
    expect(title).toEqual({ opacity: 1 });
    expect(bar).toEqual({ opacity: 0 });
    expect(scrim).toEqual({ opacity: 1 });
  });

  test('follows the scroll offset: parallax on the picture, the fade on the rest', async () => {
    const { result } = await mount();

    await act(async () => {
      result.current.scrollY.value = RANGE;
    });
    const { image, title, bar, scrim } = result.current.styles;

    expect(image).toEqual({ transform: [{ translateY: RANGE * 0.5 }, { scale: 1 }] });
    expect(title).toEqual({ opacity: 0 });
    expect(bar).toEqual({ opacity: 1 });
    expect(scrim).toEqual({ opacity: 0 });
  });

  test('animates a transform and opacities only (FR-027)', async () => {
    const { result } = await mount();
    const { image, title, bar, scrim } = result.current.styles;

    expect(Object.keys(image)).toEqual(['transform']);
    for (const style of [title, bar, scrim]) {
      expect(Object.keys(style)).toEqual(['opacity']);
    }
  });

  test('stretches under a pull', async () => {
    const { result } = await mount();
    await act(async () => {
      result.current.scrollY.value = -60;
    });
    expect(result.current.styles.image).toEqual({
      transform: [{ translateY: -30 }, { scale: 1.2 }],
    });
  });

  test('holds the picture still under reduced motion, and keeps the header switch', async () => {
    useAppearance.mockReturnValue(appearanceOf('light', { prefersLessMotion: true }));
    const { result } = await mount();

    await act(async () => {
      result.current.scrollY.value = RANGE;
    });
    expect(result.current.styles.image).toEqual({
      transform: [{ translateY: 0 }, { scale: 1 }],
    });
    expect(result.current.styles.bar).toEqual({ opacity: 1 });
  });
});
