/**
 * T059 — US5, Acceptance Scenario 5.4.
 *
 * "Given any accessibility setting is enabled, When the traveller performs any
 * task, Then every action available in the default presentation remains
 * available."
 *
 * This is a PARITY property, which is why it is a test rather than a device
 * check: the claim is not "the screen looks right under increased contrast"
 * (T058's job, and un-automatable) but "the set of actions is unchanged". A set
 * comparison is exactly what a machine is better at than a person sweeping
 * screens by hand.
 *
 * The failure this guards against is specific and easy to ship: a control that
 * is styled out of existence under one setting. A border-only rendering under
 * increased contrast that drops an icon-only button, or a control that gets
 * pushed off-layout at the largest font scale, both remove an action the
 * traveller had by default — silently, and only for the people who most need
 * the setting.
 */
import { render, type RenderResult } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ExploreScreen from '@/app/explore';
import HomeScreen from '@/app/index';

import { ActionRegistry, type ScreenName } from './action-registry';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), wrap: (c: unknown) => c },
  initSentry: jest.fn(),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * The largest text size the platform offers. FR-016 requires layouts to grow
 * with it rather than clip, so it belongs in the matrix alongside the three
 * boolean signals.
 */
const LargestFontScale = 3.0;

interface Setting {
  name: string;
  prefersMoreContrast: boolean;
  prefersLessMotion: boolean;
  prefersLessTransparency: boolean;
  fontScale: number;
}

const DEFAULT_SETTING: Setting = {
  name: 'default',
  prefersMoreContrast: false,
  prefersLessMotion: false,
  prefersLessTransparency: false,
  fontScale: 1,
};

/**
 * Each setting on its own, then all of them together. The combined case is not
 * redundant: two adaptations that are individually safe can interact — a
 * border added for contrast plus a tripled font scale is where a control gets
 * pushed out of its container.
 */
const SETTINGS: Setting[] = [
  { ...DEFAULT_SETTING, name: 'increased contrast', prefersMoreContrast: true },
  { ...DEFAULT_SETTING, name: 'reduced motion', prefersLessMotion: true },
  { ...DEFAULT_SETTING, name: 'reduced transparency', prefersLessTransparency: true },
  { ...DEFAULT_SETTING, name: 'largest text size', fontScale: LargestFontScale },
  {
    name: 'every setting at once',
    prefersMoreContrast: true,
    prefersLessMotion: true,
    prefersLessTransparency: true,
    fontScale: LargestFontScale,
  },
];

/** Points the appearance resolver's inputs at one row of the matrix. */
function applySetting(setting: Setting): void {
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() } as never);
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(setting.prefersLessMotion);
  jest
    .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
    .mockResolvedValue(setting.prefersLessTransparency);
  // Increased contrast has no cross-platform accessor; both per-platform ones
  // are set so the row means the same thing whichever OS the suite runs under.
  Object.assign(AccessibilityInfo, {
    isDarkerSystemColorsEnabled: jest.fn().mockResolvedValue(setting.prefersMoreContrast),
    isHighTextContrastEnabled: jest.fn().mockResolvedValue(setting.prefersMoreContrast),
  });
  // `useWindowDimensions` is not mockable as an export — it reads through
  // Dimensions.get on every render, so the scale is injected there instead.
  jest.spyOn(Dimensions, 'get').mockReturnValue({
    ...METRICS.frame,
    scale: 3,
    fontScale: setting.fontScale,
  });
}

const SCREENS: { name: ScreenName; element: React.ReactElement }[] = [
  { name: '<HomeScreen>', element: <HomeScreen /> },
  { name: '<ExploreScreen>', element: <ExploreScreen /> },
];

/**
 * The action set: which of the screen's registered actions the render actually
 * offers (T059, option (c) — see `./action-registry.ts` for why a registry).
 *
 * Deliberately queries only for registered IDs rather than harvesting every
 * testID in the tree. A testID is a general-purpose test hook — components
 * carry them for reasons that have nothing to do with being an action — so
 * harvesting would quietly widen "action" to mean "anything anyone wanted to
 * select in a test", and the assertion would then fail on changes that cost the
 * traveller nothing.
 *
 * Nothing about the returned identifiers depends on appearance. That is the
 * property that makes this test meaningful across settings: a colour, a shadow,
 * or a measured size would differ between rows by design, and would make every
 * row fail for a reason that is not a lost action.
 */
function collectActions(view: RenderResult, screen: ScreenName): Set<string> {
  const present = ActionRegistry[screen].filter(
    (testID) => view.queryByTestId(testID) !== null,
  );
  return new Set(present);
}

describe('action parity under accessibility settings — Acceptance Scenario 5.4', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe.each(SCREENS)('$name', ({ name, element }) => {
    /**
     * Guards the registry against the one failure mode a registry has: an entry
     * that no longer corresponds to anything on the screen. Without this, a
     * control that is deleted or renamed leaves a stale entry that is missing
     * from BOTH renders, so the parity rows keep passing over a screen the
     * registry no longer describes.
     *
     * The opposite direction — a control on screen that nobody registered —
     * cannot be caught from here; it is the accepted cost of the approach, and
     * the rule that prevents it is documented in `action-registry.ts`.
     */
    test('every registered action is present in the default presentation', async () => {
      applySetting(DEFAULT_SETTING);
      const baseline = collectActions(
        await render(
          <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>,
        ),
        name,
      );

      expect(ActionRegistry[name].length).toBeGreaterThan(0);
      expect([...baseline].sort()).toEqual([...ActionRegistry[name]].sort());
    });

    test.each(SETTINGS)('offers every default action under $name', async (setting) => {
      applySetting(DEFAULT_SETTING);
      const baseline = collectActions(
        await render(
          <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>,
        ),
        name,
      );
      // Deliberately NOT unmounting between the two renders. Each render
      // result queries its own container, so they do not interfere; calling
      // `screen.unmount()` on the global handle while holding per-render
      // handles corrupts RNTL's state and makes later renders come back empty.
      applySetting(setting);
      const adapted = collectActions(
        await render(
          <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>,
        ),
        name,
      );

      // A superset is fine — a setting may ADD an affordance (an explicit
      // border becoming its own hit target). Losing one is the violation.
      const missing = [...baseline].filter((action) => !adapted.has(action));
      expect(missing).toEqual([]);
    });
  });
});
