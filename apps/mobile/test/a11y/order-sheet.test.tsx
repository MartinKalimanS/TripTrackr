/**
 * T560 - the Home sheet's own stops (feature 005; FR-017, FR-075, contract C5-22): the REAL
 * `Sheet`, not the double of the Home suites. The handle is ONE adjustable stop named
 * "Countries and trips" that says the detent ("Peek", "Half", "Full") and offers "More" and
 * "Less"; the body's content is read as the body gives it; the grabber bar is decoration.
 *
 * The handle is the sheet's LAST child (it is drawn over the content, contract C5-22), so in the
 * tree it follows the body. Whether iOS and Android read it first or last (both may order by
 * position on the screen) is the VoiceOver and TalkBack walk of `as-built/f14-a11y.md`.
 */
import 'react-native-gesture-handler/jestSetup';

import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { Sheet } from '@/components/ui/sheet';

import { accessibleNodes, expectReadingOrder } from '../helpers/a11y-nodes';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-live'));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    (require('react') as typeof import('react')).useEffect(effect, [effect]),
}));
jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-haptics');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock;
};

beforeEach(() => {
  useHaptics.mockReturnValue({ sheetSnap: jest.fn() });
  useAppearance.mockReturnValue({
    theme: 'light',
    themeName: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: true,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ready: true,
  });
});

const DETENTS = { peek: 212, half: 439, full: 780 } as const;

const sheet = (detent: keyof typeof DETENTS) => (
  <Sheet
    detents={DETENTS}
    detent={detent}
    onDetentChange={jest.fn()}
    onSettle={jest.fn()}
    handleLabel="Countries and trips"
    renderBody={() => <Text>The body</Text>}
  />
);

describe('the real Home sheet, as a screen reader finds it', () => {
  test.each([
    ['peek', 'Peek'],
    ['half', 'Half'],
    ['full', 'Full'],
  ] as const)(
    'at %s the handle is one adjustable stop that says "%s"',
    async (detent, said) => {
      await render(sheet(detent));
      const handle = accessibleNodes().find((node) => node.id === 'home-sheet-handle');
      expect(handle).toMatchObject({
        name: 'Countries and trips',
        role: 'adjustable',
        value: said,
        actions: ['More', 'Less'],
      });
    },
  );

  test('the body is read, and the grabber bar is not a stop of its own', async () => {
    await render(sheet('half'));
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, ['The body', 'home-sheet-handle']);
    expect(nodes.some((node) => node.id === 'home-sheet-grabber')).toBe(false);
    expect(nodes).toHaveLength(2);
  });
});
