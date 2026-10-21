/**
 * F4 - `PhotoStatusPill` (picture `core/trips`, prototype `.pill.on-photo` and `.live-dot`): the
 * status chip of a card over a photograph is a WHITE capsule with navy ink in every theme, with
 * a small shadow and a coral live dot, and it says what `StatusChip` says under the same id and
 * the same accessible name.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { Palettes, type PaletteName } from '@/theme';

import { classesOf } from '../../../test/helpers/host-nodes';
import { PhotoStatusPill } from './photo-status-pill';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function setTheme(name: PaletteName) {
  useAppearance.mockReturnValue({
    theme: name.startsWith('dark') ? 'dark' : 'light',
    themeName: name,
    prefersMoreContrast: name.endsWith('-contrast'),
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors[name],
    ready: true,
  });
}

const hidden = { includeHiddenElements: true };
const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;

beforeEach(() => setTheme('light'));

describe('<PhotoStatusPill> says what StatusChip says', () => {
  test('keeps the id, the words and the accessible name of the active chip', async () => {
    await render(<PhotoStatusPill status="active" dayOf={{ day: 3, of: 8 }} />);

    const pill = screen.getByTestId('status-pill-active');
    expect(pill.props.accessibilityLabel).toBe('Status: Active, day 3 of 8');
    expect(screen.getByText('Active · Day 3 of 8')).toBeTruthy();
    expect(screen.getByTestId('status-pill-active-dot', hidden)).toBeTruthy();
  });

  test('says only "Active" with no day, and ignores a day on any other status', async () => {
    await render(<PhotoStatusPill status="active" />);
    expect(screen.getByText('Active')).toBeTruthy();
    await render(<PhotoStatusPill status="planning" dayOf={{ day: 1, of: 2 }} />);
    expect(screen.getByTestId('status-pill-planning').props.accessibilityLabel).toBe(
      'Status: Planning',
    );
    expect(screen.queryByTestId('status-pill-planning-dot', hidden)).toBeNull();
  });
});

describe('<PhotoStatusPill> is white on the photograph in every theme (prototype .pill.on-photo)', () => {
  test.each(['light', 'dark', 'light-contrast', 'dark-contrast'] as const)(
    'in %s the capsule is white, round, with a 1 dp shadow and navy words',
    async (name) => {
      setTheme(name);
      await render(<PhotoStatusPill status="active" dayOf={{ day: 3, of: 8 }} />);

      const pill = flat(screen.getByTestId('status-pill-active'));
      expect(pill.backgroundColor).toBe(Palettes[name].onPhoto);
      expect(pill.borderRadius).toBe(999);
      expect(pill.boxShadow).toEqual([
        expect.objectContaining({ offsetY: 1, blurRadius: 2 }),
      ]);
      expect(classesOf(screen.getByText('Active · Day 3 of 8'))).toContain(
        'text-accent-foreground',
      );
    },
  );

  test('the live dot is the LIGHT coral line with a 22% halo, 8 dp inside 3 dp', async () => {
    setTheme('dark');
    await render(<PhotoStatusPill status="active" />);

    const dot = flat(screen.getByTestId('status-pill-active-dot', hidden));
    expect(dot.backgroundColor).toBe(Palettes.light.accentLine);
    expect(dot.borderColor).toBe(`${Palettes.light.accentLine}38`);
    expect(dot).toMatchObject({ width: 14, height: 14, borderWidth: 3 });
  });

  test('the contrast themes take the contrast coral', async () => {
    setTheme('dark-contrast');
    await render(<PhotoStatusPill status="active" />);
    expect(
      flat(screen.getByTestId('status-pill-active-dot', hidden)).backgroundColor,
    ).toBe(Palettes['light-contrast'].accentLine);
  });
});
