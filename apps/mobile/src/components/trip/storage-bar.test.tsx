/**
 * F11 - `StorageBar` (picture `more/offline-maps`, prototype `.stor`, `.sthead`, `.stbar`,
 * `.legend`): the cream card with "412 MB used by maps", the free space at the end, a 12 dp
 * bar and its legend; it draws only what the app can measure, in every theme.
 */
import fs from 'fs';
import path from 'path';

import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { storageCaption, storageFigures } from '@/features/trips/offline-storage';
import type { OfflinePackState } from '@/features/trips/offline-packs';
import type { PaletteName } from '@/theme';

import { StorageBar, storageLabel } from './storage-bar';

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
const ready = (bytes: number): OfflinePackState => ({ kind: 'ready', bytes });

function draw(states: OfflinePackState[], free: number | null) {
  return render(
    <StorageBar
      figures={storageFigures(states, free, 'en-GB')}
      caption={storageCaption(states, 'en-GB')}
    />,
  );
}

beforeEach(() => setTheme('light'));

describe('<StorageBar>', () => {
  test('the head is the figure and "used by this trip’s maps"; the free space is at the end', async () => {
    await draw([ready(412_000_000)], 1_700_000_000);
    expect(screen.getByTestId('offline-storage-used')).toHaveTextContent('412 MB');
    expect(screen.getByText('used by this trip’s maps')).toBeTruthy();
    expect(screen.getByTestId('offline-storage-free')).toHaveTextContent('1.7 GB free');
  });

  test('the figure is not announced as a heading: the card is one summary element', async () => {
    await draw([ready(412_000_000)], 1_700_000_000);
    expect(screen.getByTestId('offline-storage-used').props.accessibilityRole).toBe(
      'text',
    );
    const card = screen.getByTestId('offline-storage');
    expect(card.props.accessibilityRole).toBe('summary');
    expect(card.props.accessibilityLabel).toBe(
      'Maps for this trip’s cities use 412 megabytes on this device. 1.7 gigabytes free.',
    );
  });

  test('the bar is 12 dp, hidden from assistive technology, with the maps segment in ink on a sand track', async () => {
    await draw([ready(100_000_000)], 300_000_000);
    const bar = screen.getByTestId('offline-storage-bar', hidden);
    expect(bar.props.accessibilityElementsHidden).toBe(true);
    expect(flat(bar).height).toBe(12);
    expect(flat(bar).overflow).toBe('hidden');
    expect(flat(screen.getByTestId('offline-storage-maps', hidden)).width).toBe('25%');
  });

  test.each(['light', 'dark', 'light-contrast', 'dark-contrast'] as PaletteName[])(
    'renders in the %s theme from tokens only: no colour literal in the component',
    async (name) => {
      setTheme(name);
      await draw([ready(100_000_000)], 300_000_000);
      expect(screen.getByTestId('offline-storage-bar', hidden)).toBeTruthy();
      expect(screen.getByTestId('offline-storage-maps', hidden)).toBeTruthy();
      const source = fs.readFileSync(path.join(__dirname, 'storage-bar.tsx'), 'utf8');
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}|rgba?[(]/);
    },
  );

  test('the legend names Maps and Free, nothing else', async () => {
    await draw([ready(100_000_000)], 300_000_000);
    const legend = within(screen.getByTestId('offline-storage-legend', hidden));
    expect(legend.getAllByText(/./, hidden).map((n) => n.props.children)).toEqual([
      'Maps',
      'Free',
    ]);
  });

  test('no free reading: no free figure, no bar, no legend, and the label is the caption alone', async () => {
    await draw([ready(5_000_000)], null);
    expect(screen.queryByTestId('offline-storage-free')).toBeNull();
    expect(screen.queryByTestId('offline-storage-bar', hidden)).toBeNull();
    expect(screen.queryByTestId('offline-storage-legend', hidden)).toBeNull();
    expect(screen.getByTestId('offline-storage').props.accessibilityLabel).toBe(
      'Maps for this trip’s cities use 5 megabytes on this device.',
    );
  });

  test('nothing saved: the head is the caption’s sentence, the bar has no maps segment', async () => {
    await draw([{ kind: 'none' }], 64_000_000_000);
    expect(screen.getByTestId('offline-storage-used')).toHaveTextContent(
      'None of this trip’s cities are saved on this device yet.',
    );
    expect(screen.queryByTestId('offline-storage-maps', hidden)).toBeNull();
    expect(screen.getByTestId('offline-storage-bar', hidden)).toBeTruthy();
  });

  test('the head wraps instead of clipping at the largest text size', async () => {
    await draw([ready(5_000_000)], 1_000_000_000);
    const head = screen.getByTestId('offline-storage-used').parent?.parent;
    expect(String(head?.props.className)).toContain('flex-wrap');
  });

  test('storageLabel says the free space only when it is known', () => {
    const states = [ready(1_000_000)];
    const caption = storageCaption(states, 'en-GB');
    expect(
      storageLabel({ figures: storageFigures(states, 2_000_000_000, 'en-GB'), caption }),
    ).toBe(`${caption.spoken} 2 gigabytes free.`);
    expect(
      storageLabel({ figures: storageFigures(states, null, 'en-GB'), caption }),
    ).toBe(caption.spoken);
  });
});
